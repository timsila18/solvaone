import fs from "node:fs";
import path from "node:path";
import React from "react";
import { Document as DocxDocument, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { Document as PdfDocument, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

const sourceDir = path.join(process.cwd(), "qa", "generated");
const outDir = path.join(process.cwd(), "qa", "exports");
fs.mkdirSync(outDir, { recursive: true });

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, lineHeight: 1.4, fontFamily: "Helvetica", color: "#000000" },
  title: { fontSize: 21, fontWeight: 700, marginBottom: 12 },
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 5, color: "#0066FF" },
  line: { marginBottom: 3 }
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
      )
    )
  );
}

function buildDocx({ title, sections }) {
  return new DocxDocument({
    title,
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 34 })], spacing: { after: 180 } }),
          ...sections.flatMap((section) => [
            new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 90 } }),
            ...section.lines.map(
              (line) =>
                new Paragraph({
                  children: [new TextRun({ text: line.replace(/^-\s+/, ""), size: 22 })],
                  bullet: /^-\s+/.test(line) ? { level: 0 } : undefined,
                  spacing: { after: 90 }
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
