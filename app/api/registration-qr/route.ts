import QRCode from "qrcode";
import { appBaseUrl } from "@/lib/draw-runner";
export async function GET() {
  const url = new URL("/signup", appBaseUrl());
  const svg = await QRCode.toString(url.toString(), {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
