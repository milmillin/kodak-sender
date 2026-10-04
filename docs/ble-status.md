# Kodak Instant printer — BLE status format

Reverse-engineered from the decompiled app (`com.prinics.ppvp.PrintService`,
`P2PService`, `a3/f` = BLE handler). Verified on a **Kodak Instant-D662** (model 102,
firmware 3.95).

## GATT layout

- **Service** `9877e0cb-a4d5-4860-a50b-ac10d83b6967`
  - **`9877e0cc`** — write, *write-without-response*. Image/firmware transfer target.
  - **`9877e0cd`** — read. The 16-byte **status** array (the app caches it as `f.f5869z`).

The app reads/polls `…e0cd`; it is not a notify characteristic here. The same byte
layout appears in the device's BLE advertisement, parsed by `P2PService.s()`.

## Status bytes (`…e0cd`, 16 bytes)

| Byte | Field | Notes / source |
|---|---|---|
| 0 | Model base code | `k()`: value, minus 10 if >10, with 4↔6 swapped |
| 1 | **Device state** | 0 = idle, 1 = printing, 5 = ready-for-next-block (firmware transfer) |
| 2 | **Print pass / result** | counts dye passes during printing; `0xFF` right after the data lands; final result code (e.g. 7) when done. Stored as `f5979j[7]` |
| 3 | **Response opcode** | 0 = status/ack, 7, 10 = print-progress/complete, 11 = cartridge changed |
| 4–5 | **Battery / charge** | 16-bit `(b4<<8)\|b5`. On firmware ≥ 26.11 the split changes: `b5` = battery, `b4` = print-available. Rises while charging. |
| 6–7 | **Head temperature °C** | 16-bit `(b6<<8)\|b7`. The app pauses the job while ≥ 55. b6 is normally 0, so b7 is the temperature. |
| 8 | **Firmware major** | `i()` |
| 9 | **Firmware minor** | `j()` → combined e.g. `03 5F` = 3.95 |
| 10 | **Copies printed** | 0-based; the app shows `b10 + 1` |
| 11 | **Total copies** for the job | |
| 12 | **Model variant / sub-type** | `k()`: if `b12 == 1` the model maps to `base`, otherwise `base + 100` (BLE models) |
| 13 | **Capability / sub-id** | `h()` → `f9096z`; `> 0` (or `b0 > 10`) marks the device as a printer |
| 14 | **Cartridge type** | `f5982m` / `sVar.f5999i` |
| 15 | reserved / unused | |

### `l()` — firmware-era predicate
`P2PService.l(status)` is true when `b8 > 26`, or `b8 == 26 && b9 >= 11`. It only
switches the battery byte interpretation (4–5); temperature is 16-bit either way.

### Model mapping (`k()`)
```
base = b0; if (base > 10) base -= 10; if (base == 6) base = 4; else if (base == 4) base = 6;
model = (b12 != 1) ? base + 100 : base + <const>;
```
D662: `b0 = 0x02`, `b12 = 0x00` → `model = 102` → the 640×1024 profile.

## Worked examples (captured on a D662, fw 3.95)

```
idle/charging : 02 00 00 00 08 98 00 16 03 5f 00 00 00 00 00 00
printing      : 02 01 ff 00 08 ca 00 19 03 5f 00 01 00 00 00 00
done          : 02 00 07 00 08 ca 00 2a 03 5f 01 01 00 00 00 00
```
The last frame = **idle, result 7, 42 °C, 1/1 copies printed, fw 3.95, cartridge 0**.
Battery `(0x08<<8)|0xCA` rising across frames = the printer was on the charger.

## Completion / gating logic used by the sender
- **Temperature gate:** abort/pause when `((b6<<8)|b7) >= 55`.
- **Print done:** `b1 == 0` (idle) and `b10 >= b11` (printed ≥ total); `b2` holds the result code.
- **Firmware-block flow (ESP path only):** wait for `b1 == 5` before the next block.

## Transfer framing (for reference)
Writes go to `…e0cc`, write-without-response:
- **Start packet (10 B):** `[len₂₄][len₁₆][len₈] 00 00 00 [copies] 00 00 00`
- **Data packets (5 + N, N ≤ 200):** `[off₂₄][off₁₆][off₈] [N₁₅..₈][N₇..₀]` + N bytes

See `src/ble/` (`protocol.ts`, `printer.ts`) for the implementation, or `decodeStatus` / `transfer` in `reference/send.html`.
