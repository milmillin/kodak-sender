import { describe, expect, it } from "vitest";
import { legacy } from "./legacy";
import { dataPacket, decodeStatus, describeJob, startPacket } from "../ble/protocol";
import { profileFor } from "../pipeline/models";

const bytes = (s: string) => Uint8Array.from(s.split(" ").map((h) => parseInt(h, 16)));

describe("decodeStatus", () => {
  // worked examples from docs/ble-status.md (D662, fw 3.95)
  it("idle/charging", () => {
    const s = decodeStatus(bytes("02 00 00 00 08 98 00 16 03 5f 00 00 00 00 00 00"));
    expect(s).toMatchObject({ model: 102, state: 0, stateName: "idle", tempC: 22, battery: 0x898, fw: "3.95", printed: 0, total: 0 });
    expect(profileFor(s.model!)).toBe(0);
  });
  it("printing", () => {
    expect(decodeStatus(bytes("02 01 ff 00 08 ca 00 19 03 5f 00 01 00 00 00 00"))).toMatchObject({ state: 1, stateName: "printing", pass: 0xff, tempC: 25, total: 1 });
  });
  it("done", () => {
    expect(decodeStatus(bytes("02 00 07 00 08 ca 00 2a 03 5f 01 01 00 00 00 00"))).toMatchObject({ state: 0, pass: 7, tempC: 42, printed: 1, total: 1, cartridge: 0 });
  });
  it("matches the original decoder", () => {
    for (const hexs of ["0c 05 00 0b 00 40 00 37 1a 0b 00 00 01 02 03 00", "04 00", "16 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00"]) {
      const b = bytes(hexs);
      const { raw: _raw, ...ported } = decodeStatus(b);
      expect(ported).toEqual({ ...legacy.decodeStatus(b) });
    }
  });
});

describe("packets", () => {
  it("start packet", () => {
    expect([...startPacket(212345, 1)]).toEqual([...legacy.startPacket(212345, 1)]);
    expect([...startPacket(0x123456, 2)]).toEqual([0x12, 0x34, 0x56, 0, 0, 0, 2, 0, 0, 0]);
  });
  it("data packets cover the job exactly", () => {
    const job = Uint8Array.from({ length: 33792 + 77 }, (_, i) => i & 255);
    const out: number[] = [];
    for (let off = 0; off < job.length; off += 200) {
      const p = dataPacket(job, off);
      expect((p[0] << 16) | (p[1] << 8) | p[2]).toBe(off);
      expect((p[3] << 8) | p[4]).toBe(p.length - 5);
      out.push(...p.subarray(5));
    }
    expect(Uint8Array.from(out)).toEqual(job);
    expect(describeJob(job)[0]).toContain("170 data packets");
  });
});
