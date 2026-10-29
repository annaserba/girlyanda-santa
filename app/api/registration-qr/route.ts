import QRCode from "qrcode";
export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  let origin: URL;
  try {
    // The client supplies the browser origin so reverse-proxy internal addresses
    // never leak into the QR. No forwarded-host headers or build-time URL needed.
    origin = new URL(
      requestUrl.searchParams.get("origin") ?? requestUrl.origin,
    );
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("Invalid origin");
  } catch {
    return new Response("Некорректный адрес сайта.", { status: 400 });
  }
  const url = new URL("/signup", origin.origin);
  const svg = await QRCode.toString(url.toString(), {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: "M",
  });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
