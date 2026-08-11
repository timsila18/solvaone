import fs from "node:fs";
import path from "node:path";
import React from "react";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Footer,
  HeadingLevel,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  TextRun
} from "docx";
import { Document as PdfDocument, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const sourceDir = path.join(process.cwd(), "qa", "generated");
const outDir = path.join(process.cwd(), "qa", "exports");
fs.mkdirSync(outDir, { recursive: true });

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 46, fontSize: 12, lineHeight: 1.15, fontFamily: "Helvetica", color: "#000000" },
  title: { fontSize: 21, fontWeight: 700, marginBottom: 12 },
  section: { marginBottom: 9 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 5, color: "#0066FF" },
  line: { marginBottom: 4, textAlign: "justify" },
  footer: { position: "absolute", bottom: 18, left: 40, right: 40, paddingTop: 5, borderTopWidth: 1, borderTopColor: "#0066FF", fontSize: 8.5, textAlign: "right" }
});

function parseMarkdown(markdown) {
  const [titleLine = "# Document", ...rest] = markdown.split(/\r?\n/);
  const title = titleLine.replace(/^#\s*/, "").trim();
  const chunks = rest.join("\n").split(/\n##\s+/).filter(Boolean);
  const sections = chunks
    .map((chunk) => {
      const [heading = "Section", ...body] = chunk.split(/\r?\n/);
      return {
        title: heading.trim(),
        lines: body
          .join("\n")
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      };
    })
    .filter((section) => !["QA Scores", "ATS Keywords", "Improvements Made", "Missing Information"].includes(section.title));
  return { title, sections };
}

function buildPdf({ title, sections }) {
  return React.createElement(
    PdfDocument,
    { title },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, title),
      ...sections.map((section) =>
        React.createElement(
          View,
          { key: section.title, style: styles.section, wrap: true },
          React.createElement(Text, { style: styles.sectionTitle }, section.title),
          ...section.lines.map((line, index) => React.createElement(Text, { key: `${section.title}-${index}`, style: styles.line }, line))
        )
      ),
      React.createElement(Text, {
        fixed: true,
        style: styles.footer,
        render: ({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`
      })
    )
  );
}

function buildDocx({ title, sections }) {
  return new DocxDocument({
    title,
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 24, color: "000000" },
          paragraph: { alignment: AlignmentType.BOTH, spacing: { after: 72, line: 276, lineRule: LineRuleType.AUTO } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 936, right: 936, bottom: 936, left: 936, header: 432, footer: 432 }
          }
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { color: "0066FF", space: 4, style: BorderStyle.SINGLE, size: 4 } },
                children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 18, font: "Arial" })]
              })
            ]
          })
        },
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 44, font: "Arial" })], alignment: AlignmentType.CENTER, spacing: { after: 144 } }),
          ...sections.flatMap((section) => [
            new Paragraph({
              children: [new TextRun({ text: section.title.toUpperCase(), bold: true, size: 26, font: "Arial" })],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 180, after: 84, line: 276, lineRule: LineRuleType.AUTO },
              border: { bottom: { color: "0066FF", space: 1, style: BorderStyle.SINGLE, size: 6 } },
              keepNext: true
            }),
            ...section.lines.map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line.replace(/^-\s+/, ""), size: 24, font: "Arial" })],
                  bullet: /^-\s+/.test(line) ? { level: 0 } : undefined,
                  alignment: AlignmentType.BOTH,
                  spacing: { after: 72, line: 276, lineRule: LineRuleType.AUTO },
                  widowControl: true
                })
            )
          ])
        ]
      }
    ]
  });
}

const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".md"));
const summary = [];

for (const file of files) {
  const input = parseMarkdown(fs.readFileSync(path.join(sourceDir, file), "utf8"));
  const base = file.replace(/\.md$/, "");
  const pdfPath = path.join(outDir, `${base}.pdf`);
  const docxPath = path.join(outDir, `${base}.docx`);
  const pdf = await renderToBuffer(buildPdf(input));
  const docx = await Packer.toBuffer(buildDocx(input));
  fs.writeFileSync(pdfPath, pdf);
  fs.writeFileSync(docxPath, docx);
  summary.push({
    file: base,
    pdfPath,
    pdfBytes: pdf.length,
    docxPath,
    docxBytes: docx.length,
    sections: input.sections.length
  });
}

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
