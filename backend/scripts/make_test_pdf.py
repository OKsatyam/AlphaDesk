"""Run: python make_test_pdf.py  →  creates test_report.pdf in current dir"""
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

doc = SimpleDocTemplate("test_report.pdf", pagesize=A4)
styles = getSampleStyleSheet()
h1 = ParagraphStyle('h1', parent=styles['Heading1'], fontSize=18, spaceAfter=6)
h2 = ParagraphStyle('h2', parent=styles['Heading2'], fontSize=13, spaceAfter=4)
body = styles['BodyText']

story = []

story.append(Paragraph("TechCorp India Ltd — Annual Report FY2024", h1))
story.append(Paragraph("CIN: L72200MH2001PLC123456 | BSE: 532999 | NSE: TECHCORP", body))
story.append(Spacer(1, 8*mm))

story.append(Paragraph("Financial Highlights", h2))
story.append(Paragraph(
    "Revenue from operations stood at <b>₹12,450 Crore</b> for FY2024, "
    "reflecting a growth of <b>18.4%</b> year-on-year. "
    "Profit After Tax (PAT) was <b>₹1,872 Crore</b>, up 22% from ₹1,534 Crore in FY2023. "
    "EBITDA margin improved to <b>21.3%</b> from 19.8% in the previous year. "
    "Earnings Per Share (EPS) stood at <b>₹62.40</b>.",
    body))
story.append(Spacer(1, 4*mm))

story.append(Paragraph("Key Financial Metrics", h2))
data = [
    ["Metric", "FY2024", "FY2023", "YoY Change"],
    ["Revenue (₹ Cr)", "12,450", "10,514", "+18.4%"],
    ["EBITDA (₹ Cr)", "2,652", "2,082", "+27.4%"],
    ["PAT (₹ Cr)", "1,872", "1,534", "+22.0%"],
    ["EPS (₹)", "62.40", "51.13", "+22.0%"],
    ["Debt-to-Equity", "0.18x", "0.22x", "Improved"],
    ["ROCE (%)", "24.6%", "21.3%", "+330 bps"],
    ["Dividend per share (₹)", "8.00", "6.50", "+23.1%"],
]
t = Table(data, colWidths=[80*mm, 30*mm, 30*mm, 35*mm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#4F46E5')),
    ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
    ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE',   (0,0), (-1,-1), 9),
    ('GRID',       (0,0), (-1,-1), 0.5, colors.lightgrey),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#F5F5FF')]),
    ('ALIGN',      (1,0), (-1,-1), 'CENTER'),
]))
story.append(t)
story.append(Spacer(1, 6*mm))

story.append(Paragraph("Business Segments", h2))
story.append(Paragraph(
    "TechCorp operates in three segments: <b>IT Services</b> (65% of revenue, ₹8,093 Cr), "
    "<b>Product & Platforms</b> (22% of revenue, ₹2,739 Cr), and "
    "<b>BPO Services</b> (13% of revenue, ₹1,618 Cr). "
    "IT Services grew 20% YoY driven by cloud migration projects in BFSI and healthcare verticals.",
    body))
story.append(Spacer(1, 4*mm))

story.append(Paragraph("Risk Factors", h2))
story.append(Paragraph(
    "1. <b>Currency Risk:</b> Approximately 68% of revenue is USD-denominated. "
    "A 1% appreciation in INR reduces revenue by approximately ₹85 Crore. "
    "2. <b>Client Concentration:</b> Top 10 clients contribute 41% of revenue. "
    "3. <b>Talent Attrition:</b> LTM attrition stands at 14.2%, above the industry median of 12%. "
    "4. <b>Regulatory Risk:</b> H-1B visa restrictions could increase onshore delivery costs.",
    body))
story.append(Spacer(1, 4*mm))

story.append(Paragraph("Management Outlook", h2))
story.append(Paragraph(
    "Management guides for revenue growth of <b>15–17%</b> in FY2025, "
    "with EBITDA margins expected to sustain in the 20–22% band. "
    "Capex for FY2025 is budgeted at ₹320 Crore, primarily for AI/ML infrastructure. "
    "The board has approved a buyback of ₹500 Crore at ₹850 per share.",
    body))

doc.build(story)
print("Created: test_report.pdf")
