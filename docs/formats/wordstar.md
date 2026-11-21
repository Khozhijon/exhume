# WordStar document (.ws, .wsd, often no extension) 1978-c.1992, MicroPro (CP/M, DOS)
Source: WordStar 3.3/4.0 reference manuals (file format appendix), WordStar 4.0 "Document mode" notes.
Covers WordStar 3.x and 4.0 document files. WordStar 5+ adds "symmetrical sequences"
(0x1D, u16le length, payload, 0x1D): skip each sequence, add one warning that 5.x formatting was ignored.

## The high bit
WordStar is 7-bit ASCII. In document mode it sets bit 7 as a formatting flag:
- on the **last character of every word** (so `0xE5` is `e` at the end of a word),
- `0xA0` = **soft space** inserted by justification (drop it, or treat as a normal space if it is the
  only separator),
- `0x8D 0x0A` = **soft carriage return** inserted by word wrap (join the lines with a single space),
- `0x8A` alone = soft line feed (ignore).
So: text byte = `b & 0x7F`, after handling the soft cases above.
`0x0D 0x0A` (no high bit) is a **hard return**: end of paragraph.

## Control characters (toggles apply until toggled off or end of paragraph)
| byte | key | meaning |
|---|---|---|
| 0x02 | ^B | bold on/off |
| 0x13 | ^S | underline on/off |
| 0x19 | ^Y | italic on/off (WordStar 4; ribbon colour before) |
| 0x04 | ^D | double strike on/off (render as bold) |
| 0x18 | ^X | strikeout on/off |
| 0x14 | ^T | superscript on/off |
| 0x16 | ^V | subscript on/off |
| 0x08 | ^H | overprint previous character (drop) |
| 0x0F | ^O | non-breaking space |
| 0x1E | | inactive soft hyphen (drop) |
| 0x1F | | active soft hyphen at a soft line end (drop, join the word) |
| 0x09 | ^I | tab |
| 0x0C | ^L | page break |
| 0x1A | ^Z | end of file (CP/M pads the last 128-byte record with ^Z): stop here |
Other control bytes below 0x20: drop, count them in one warning.

## Dot commands
A line whose first character is `.` is a command, not text. Keep them out of the body.
`.PA` page break, `.HE text` header, `.FO text` footer, `.OP` omit page numbers, `.PN n` page number,
`..` or `.IG` comment. Others (`.MT .MB .LH .PL .PO .CP .LM .RM .UJ` ...) are recorded in
`meta.dotCommands` and otherwise ignored.

## Detection (there is no magic number)
Score from structure: share of bytes with the high bit set whose low 7 bits are a letter and which are
followed by a space or punctuation; presence of `0x8D 0x0A`; lines starting with known dot commands;
absence of NUL bytes. Pure 7-bit text with no dot commands is not WordStar (confidence <= 0.1).

## Payload model
`{ kind:"document", blocks:[ {type:"paragraph", runs:[{text, bold?, italic?, underline?, strike?, sup?, sub?}]} | {type:"pageBreak"} ], header?:string, footer?:string }`
