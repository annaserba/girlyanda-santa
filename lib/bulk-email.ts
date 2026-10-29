/** Parse a pasted recipient list without putting extra headers in a mailto URL. */
export function parseRecipients(value: string): {
  addresses: string[];
  invalid: string[];
} {
  const addresses: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const email = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

  for (const token of value.split(/[\s,;]+/).filter(Boolean)) {
    const address = token.toLowerCase();
    if (!email.test(address)) {
      invalid.push(token);
    } else if (!seen.has(address)) {
      seen.add(address);
      addresses.push(address);
    }
  }

  return { addresses, invalid };
}

/** One common message. Recipient addresses are always in BCC, never To or CC. */
export function buildBulkMailto(
  recipients: string,
  subject: string,
  body: string,
): string | null {
  const { addresses, invalid } = parseRecipients(recipients);
  if (addresses.length === 0 || invalid.length > 0) return null;

  const headers = [
    `bcc=${addresses.map((address) => encodeURIComponent(address)).join(",")}`,
    `subject=${encodeURIComponent(subject.replace(/[\r\n]+/g, " "))}`,
    `body=${encodeURIComponent(body.replace(/\r\n|\r|\n/g, "\r\n"))}`,
  ];
  return `mailto:?${headers.join("&")}`;
}
