export class StreamingJsonAnswerExtractor {
  private state: "seeking_answer" | "in_answer" | "done" = "seeking_answer";
  private buffer = "";
  private escaped = false;
  private unicodeEscape = "";

  push(textDelta: string): string {
    if (this.state === "done") {
      return "";
    }

    if (this.state === "seeking_answer") {
      this.buffer += textDelta;
      const match = /"answer"\s*:\s*"/u.exec(this.buffer);

      if (!match) {
        this.buffer = this.buffer.slice(-32);
        return "";
      }

      const answerStartIndex = match.index + match[0].length;
      const remaining = this.buffer.slice(answerStartIndex);
      this.buffer = "";
      this.state = "in_answer";

      return this.consumeAnswerText(remaining);
    }

    return this.consumeAnswerText(textDelta);
  }

  private consumeAnswerText(text: string): string {
    let output = "";

    for (const char of text) {
      if (this.unicodeEscape.length > 0) {
        this.unicodeEscape += char;

        if (this.unicodeEscape.length === 5) {
          output += decodeUnicodeEscape(this.unicodeEscape);
          this.unicodeEscape = "";
        }
        continue;
      }

      if (this.escaped) {
        if (char === "u") {
          this.unicodeEscape = "u";
        } else {
          output += decodeJsonStringEscape(char);
        }
        this.escaped = false;
        continue;
      }

      if (char === "\\") {
        this.escaped = true;
        continue;
      }

      if (char === "\"") {
        this.state = "done";
        break;
      }

      output += char;
    }

    return output;
  }
}

function decodeJsonStringEscape(char: string): string {
  switch (char) {
    case "\"":
      return "\"";
    case "\\":
      return "\\";
    case "/":
      return "/";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return char;
  }
}

function decodeUnicodeEscape(value: string): string {
  const hex = value.slice(1);
  const codePoint = Number.parseInt(hex, 16);

  return Number.isFinite(codePoint) ? String.fromCharCode(codePoint) : "";
}
