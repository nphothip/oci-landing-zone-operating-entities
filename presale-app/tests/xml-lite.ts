// Minimal well-formedness check (tag balance + attribute quoting) — enough to
// catch escaping bugs in the draw.io serializer without an XML dependency.
export class XMLParser {
  assertWellFormed(xml: string): void {
    const stack: string[] = [];
    const tagRe = /<(\/?)([A-Za-z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
    let cleaned = xml.replace(/<\?xml[^?]*\?>/, "");
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = tagRe.exec(cleaned)) !== null) {
      const [, close, name, , selfClose] = match;
      const between = cleaned.slice(consumed, match.index);
      if (between.includes("<")) throw new Error(`stray '<' before ${name}`);
      consumed = match.index + match[0].length;
      if (selfClose) continue;
      if (close) {
        const open = stack.pop();
        if (open !== name) throw new Error(`mismatched </${name}>, expected </${open}>`);
      } else {
        stack.push(name);
      }
    }
    if (stack.length > 0) throw new Error(`unclosed tags: ${stack.join(", ")}`);
  }
}
