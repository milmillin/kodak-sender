import { bluetoothAvailable } from "../ble/printer";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function EnvBanner() {
  if (!window.isSecureContext) {
    return <div className="banner bad"><b>Not a secure context.</b> Bluetooth needs HTTPS or localhost.</div>;
  }
  if (!bluetoothAvailable()) {
    return (
      <div className="banner bad">
        <b>This browser can't use Bluetooth.</b>{" "}
        {isIOS()
          ? <>Safari on iPhone/iPad doesn't support Web Bluetooth. Open this page in the <b>Bluefy</b> browser instead.</>
          : <>Use Chrome or Edge on desktop or Android.</>}{" "}
        You can still prepare a photo here and save the JPEG.
      </div>
    );
  }
  return null;
}
