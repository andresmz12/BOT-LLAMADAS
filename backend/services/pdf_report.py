"""Corporate-style PDF report generator for email marketing metrics."""
from io import BytesIO
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable,
)
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

NAVY = colors.HexColor("#0B1530")
BLUE = colors.HexColor("#2563EB")
BLUE_LIGHT = colors.HexColor("#60A5FA")
GRAY = colors.HexColor("#64748B")
GRAY_LIGHT = colors.HexColor("#F1F5F9")
GREEN = colors.HexColor("#16A34A")
RED = colors.HexColor("#DC2626")
BORDER = colors.HexColor("#E2E8F0")

styles = getSampleStyleSheet()

TITLE_STYLE = ParagraphStyle(
    "Title", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=20, textColor=NAVY, spaceAfter=2, alignment=TA_LEFT,
)
SUBTITLE_STYLE = ParagraphStyle(
    "Subtitle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=10, textColor=GRAY, spaceAfter=0,
)
SECTION_STYLE = ParagraphStyle(
    "Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13, textColor=NAVY, spaceBefore=18, spaceAfter=8,
)
KPI_LABEL_STYLE = ParagraphStyle(
    "KpiLabel", fontName="Helvetica", fontSize=8.5, textColor=GRAY, alignment=TA_CENTER,
)
KPI_VALUE_STYLE = ParagraphStyle(
    "KpiValue", fontName="Helvetica-Bold", fontSize=18, textColor=NAVY, alignment=TA_CENTER,
)
SMALL = ParagraphStyle("Small", fontName="Helvetica", fontSize=8, textColor=GRAY)
TABLE_HEADER_STYLE = ParagraphStyle(
    "TblHeader", fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.white,
)
TABLE_CELL_STYLE = ParagraphStyle(
    "TblCell", fontName="Helvetica", fontSize=8.5, textColor=NAVY,
)


def _kpi_card(label: str, value: str, accent=BLUE):
    p_value = Paragraph(value, KPI_VALUE_STYLE)
    p_label = Paragraph(label.upper(), KPI_LABEL_STYLE)
    t = Table([[p_value], [p_label]], colWidths=[38 * mm])
    t.setStyle(TableStyle([
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
        ("BOX", (0, 0), (-1, -1), 1, BORDER),
        ("LINEABOVE", (0, 0), (-1, 0), 3, accent),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ]))
    return t


def _header(canvas, doc, org_name: str):
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, A4[1] - 22 * mm, A4[0], 22 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(20 * mm, A4[1] - 14 * mm, "ZyraVoice")
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(BLUE_LIGHT)
    canvas.drawString(20 * mm, A4[1] - 19 * mm, "Reporte de Email Marketing")
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColor(colors.white)
    canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 14 * mm, org_name[:40])
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(BLUE_LIGHT)
    canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 19 * mm, datetime.utcnow().strftime("%d/%m/%Y %H:%M UTC"))
    canvas.restoreState()


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(BORDER)
    canvas.line(20 * mm, 14 * mm, A4[0] - 20 * mm, 14 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(GRAY)
    canvas.drawString(20 * mm, 9 * mm, "Generado automáticamente por ZyraVoice — Confidencial")
    canvas.drawRightString(A4[0] - 20 * mm, 9 * mm, f"Página {doc.page}")
    canvas.restoreState()


def _on_page(canvas, doc, org_name):
    _header(canvas, doc, org_name)
    _footer(canvas, doc)


def _data_table(headers, rows, col_widths=None):
    header_row = [Paragraph(h, TABLE_HEADER_STYLE) for h in headers]
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), TABLE_CELL_STYLE) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRAY_LIGHT]),
        ("LINEBELOW", (0, 0), (-1, 0), 1, NAVY),
        ("GRID", (0, 1), (-1, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    t.setStyle(TableStyle(style))
    return t


def build_email_stats_pdf(org_name: str, stats: dict) -> bytes:
    """Render the email marketing stats payload (from GET /stats/email) into a corporate PDF."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=30 * mm, bottomMargin=20 * mm,
        leftMargin=20 * mm, rightMargin=20 * mm,
        title="Reporte de Email Marketing",
    )
    elements = []

    elements.append(Paragraph("Resumen Ejecutivo", TITLE_STYLE))
    elements.append(Paragraph(
        f"Período: últimos 7 días &nbsp;·&nbsp; Organización: {org_name}",
        SUBTITLE_STYLE,
    ))
    elements.append(Spacer(1, 14))

    kpi_row1 = [
        _kpi_card("Enviados", str(stats.get("total_sent", 0))),
        _kpi_card("Entregados", str(stats.get("delivered", 0)), GREEN),
        _kpi_card("Tasa de entrega", f"{stats.get('delivery_rate', 0)}%", GREEN),
        _kpi_card("Errores", str(stats.get("total_errors", 0)), RED),
    ]
    kpi_table1 = Table([kpi_row1], colWidths=[39.5 * mm] * 4)
    kpi_table1.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    elements.append(kpi_table1)
    elements.append(Spacer(1, 6))

    kpi_row2 = [
        _kpi_card("Aperturas únicas", str(stats.get("unique_opens", 0))),
        _kpi_card("Tasa de apertura", f"{stats.get('open_rate', 0)}%"),
        _kpi_card("Clics únicos", str(stats.get("unique_clicks", 0))),
        _kpi_card("Tasa de clics", f"{stats.get('click_rate', 0)}%"),
    ]
    kpi_table2 = Table([kpi_row2], colWidths=[39.5 * mm] * 4)
    kpi_table2.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    elements.append(kpi_table2)
    elements.append(Spacer(1, 6))

    kpi_row3 = [
        _kpi_card("Rebotes", str(stats.get("bounces", 0)), RED),
        _kpi_card("Tasa de rebote", f"{stats.get('bounce_rate', 0)}%", RED),
        _kpi_card("Bajas (unsub)", str(stats.get("unsubscribes", 0)), RED),
        _kpi_card("Aperturas totales", str(stats.get("opens", 0))),
    ]
    kpi_table3 = Table([kpi_row3], colWidths=[39.5 * mm] * 4)
    kpi_table3.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    elements.append(kpi_table3)

    # ── Por día ──────────────────────────────────────────────────────────
    by_day = stats.get("by_day") or []
    if by_day:
        elements.append(Paragraph("Actividad de los últimos 7 días", SECTION_STYLE))
        headers = ["Fecha", "Enviados", "Entregados", "Aperturas", "Clics"]
        rows = [[d.get("date", ""), d.get("sent", 0), d.get("delivered", 0),
                 d.get("opens", 0), d.get("clicks", 0)] for d in by_day]
        elements.append(_data_table(headers, rows, col_widths=[34 * mm, 33 * mm, 33 * mm, 33 * mm, 27 * mm]))

    # ── Por plantilla ────────────────────────────────────────────────────
    by_template = stats.get("by_template") or []
    if by_template:
        elements.append(Paragraph("Rendimiento por plantilla", SECTION_STYLE))
        headers = ["Plantilla", "Enviados", "Entregados", "% Apertura", "% Clics"]
        rows = [[t.get("key", ""), t.get("sent", 0), t.get("delivered", 0),
                 f"{t.get('open_rate', 0)}%", f"{t.get('click_rate', 0)}%"] for t in by_template]
        elements.append(_data_table(headers, rows, col_widths=[40 * mm, 30 * mm, 30 * mm, 30 * mm, 30 * mm]))

    # ── Envíos recientes ─────────────────────────────────────────────────
    recent_sends = stats.get("recent_sends") or []
    if recent_sends:
        elements.append(Paragraph("Últimos envíos masivos", SECTION_STYLE))
        headers = ["Fecha", "Plantilla", "Campaña", "Enviados", "Errores", "Por"]
        rows = []
        for s in recent_sends[:10]:
            try:
                dt = datetime.fromisoformat(s.get("sent_at", "").replace("Z", "+00:00"))
                date_str = dt.strftime("%d/%m %H:%M")
            except Exception:
                date_str = s.get("sent_at", "")[:16]
            rows.append([
                date_str,
                s.get("template_key", "—"),
                (s.get("campaign_name") or "—")[:22],
                s.get("total_sent", 0),
                s.get("total_errors", 0),
                (s.get("initiated_by") or "—")[:18],
            ])
        elements.append(_data_table(
            headers, rows,
            col_widths=[24 * mm, 26 * mm, 38 * mm, 22 * mm, 22 * mm, 28 * mm],
        ))

    elements.append(Spacer(1, 16))
    elements.append(HRFlowable(width="100%", color=BORDER, thickness=0.5))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        "Las tasas de apertura y clics se calculan sobre el total de correos entregados. "
        "Los rebotes incluyen direcciones inválidas y buzones llenos.",
        SMALL,
    ))

    doc.build(
        elements,
        onFirstPage=lambda c, d: _on_page(c, d, org_name),
        onLaterPages=lambda c, d: _on_page(c, d, org_name),
    )
    return buf.getvalue()
