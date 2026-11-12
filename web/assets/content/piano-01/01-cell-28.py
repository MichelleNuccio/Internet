from matplotlib.ticker import MultipleLocator
from matplotlib.lines import Line2D

neon_palette = [
    "#F15BB5",  # magenta  -> telco / consortium
    "#00CFE8",  # cyan  -> Microsoft
    "#1C8CFF",  # blue  -> Google
    "#9B5DE5",  # violet -> multiple big tech
    "#FEE440",  # pink  -> Meta
    "#56E0C5",
    "#FEE440",
    "#FF8C42",  # orange -> Amazon / AWS
]

BIG_TECH_LABELS = {
    "Google": "Google",
    "Meta": "Meta",
    "Facebook": "Meta",
    "Microsoft": "Microsoft",
    "Amazon": "Amazon",
    "Amazon Web Services": "Amazon",
    "AWS": "Amazon",
}

ownership_colors = {
    "Telco / consortium": neon_palette[0],
    "Google": neon_palette[2],
    "Meta": neon_palette[4],
    "Microsoft": neon_palette[1],
    "Amazon": neon_palette[7],
    "Multiple big tech": neon_palette[3],
    "Unknown": "#6F7898",
}


def split_owners(raw):
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return []
    text = str(raw).strip()
    if not text:
        return []
    return [part.strip() for part in text.split(",") if part.strip()]


def ownership_group(raw_owners):
    owners = split_owners(raw_owners)
    if not owners:
        return "Unknown"
    big = []
    for owner in owners:
        label = BIG_TECH_LABELS.get(owner)
        if label and label not in big:
            big.append(label)
    if not big:
        return "Telco / consortium"
    if len(big) == 1:
        return big[0]
    return "Multiple big tech"


def ownership_legend(ax_or_fig, on_figure=False):
    legend_order = [
        "Telco / consortium",
        "Google",
        "Meta",
        "Microsoft",
        "Amazon",
        "Multiple big tech",
    ]
    handles = [
        Line2D([0], [0], color=ownership_colors[name], linewidth=3, label=name)
        for name in legend_order
    ]
    if on_figure:
        legend = ax_or_fig.legend(
            handles=handles,
            title="Ownership group",
            loc="lower center",
            bbox_to_anchor=(0.5, -0.12),
            ncol=6,
            frameon=False,
            fontsize=8,
        )
    else:
        legend = ax_or_fig.legend(
            handles=handles,
            title="Ownership group",
            loc="upper right",
            frameon=False,
            fontsize=8,
        )
    plt.setp(legend.get_texts(), color="#FFFFFF")
    legend.get_title().set_color("#FFFFFF")
    return legend


length_base = metadata.dropna(subset=["length_km", "name"]).copy()
length_base["ownership_group"] = length_base["owners"].apply(ownership_group)
length_base["bar_color"] = length_base["ownership_group"].map(ownership_colors)

by_length = length_base.sort_values("length_km", ascending=False).reset_index(drop=True)

fig, ax = plt.subplots(figsize=(18, 10), facecolor="#090A18")
ax.set_facecolor("#090A18")
ax.bar(
    range(len(by_length)),
    by_length["length_km"].astype(float),
    width=0.35,
    color=by_length["bar_color"].tolist(),
    edgecolor=by_length["bar_color"].tolist(),
    linewidth=0.35,
)

ax.set_title(
    "Submarine cable systems by length (longest to shortest)",
    color="#FFFFFF",
    loc="left",
)
ax.set_xlabel("Cable system", color="#FFFFFF")
ax.set_ylabel("Length (km)", color="#FFFFFF")

label_step = 1
tick_positions = list(range(0, len(by_length), label_step))
ax.set_xticks(tick_positions)
ax.set_xticklabels(
    by_length.loc[tick_positions, "name"].tolist(),
    rotation=90,
    ha="center",
    va="top",
    color="#FFFFFF",
    fontsize=3,
)
ax.tick_params(axis="y", colors="#FFFFFF")
ax.spines["bottom"].set_color("#FFFFFF")
ax.spines["left"].set_color("#FFFFFF")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.yaxis.set_major_locator(MultipleLocator(2500))
ax.set_axisbelow(True)
ax.grid(axis="y", which="major", color="#FFFFFF", alpha=0.25)
ownership_legend(ax)

plt.tight_layout()
fig.savefig(
    "01-CableOwnership.png",
    dpi=600,
    facecolor="#090A18",
    edgecolor="none",
)
plt.show()
plt.close(fig)

print(f"Cables plotted: {len(by_length):,}")
print(by_length["ownership_group"].value_counts().to_string())