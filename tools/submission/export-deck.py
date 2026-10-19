import json
from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

root = Path(__file__).resolve().parents[2]
out = root / "submission" / "generated"
data = json.loads((out / "deck-data.json").read_text(encoding="utf-8"))
presentation = Presentation()
presentation.core_properties.author = "Guardian Wallet team"
presentation.core_properties.title = "Guardian Wallet — Astra evidence and evaluation"
presentation.slide_width, presentation.slide_height = Inches(13.333), Inches(7.5)
for index, item in enumerate(data["slides"], 1):
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = RGBColor.from_string("071523")
    def box(x, y, w, h, text, size, color, bold=False):
        frame = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)).text_frame
        frame.word_wrap = True
        for i, line in enumerate(text.split("\n")):
            paragraph = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
            paragraph.text, paragraph.font.size = line, Pt(size)
            paragraph.font.name, paragraph.font.bold = "Aptos", bold
            paragraph.font.color.rgb = RGBColor.from_string(color)
            paragraph.space_after = Pt(14)
    box(.65, .45, 12, .5, item["eyebrow"], 13, "65E0CA", True)
    box(.65, 1.05, 12, 1.1, item["title"], 34, "E7F0F8", True)
    box(.7, 2.35, 11.8, 3.8, "\n".join("• " + value for value in item["bullets"]), 23, "E7F0F8")
    box(.65, 6.6, 12, .65, f"{index}/{len(data['slides'])} · {item['evidence']}", 11, "B9D1DE")
    slide.notes_slide.notes_text_frame.text = item["narration"] + "\n\nPublic transaction: " + data["payment"]["explorer"] + "\nPresentation target: about 45–55 seconds per slide; under 10 minutes total."
presentation.save(out / "Guardian-Wallet-presentation.pptx")
print(json.dumps({"pptx": str(out / "Guardian-Wallet-presentation.pptx"), "slides": len(presentation.slides)}))
