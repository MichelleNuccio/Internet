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

by_year = (
    length_base.dropna(subset=["rfs_year"])
    .assign(rfs_year=lambda d: pd.to_numeric(d["rfs_year"], errors="coerce"))
    .dropna(subset=["rfs_year"])
    .sort_values(["rfs_year", "length_km"], ascending=[True, False])
    .copy()
)
by_year["rfs_year"] = by_year["rfs_year"].astype(int)

# Build x positions with a gap between successive years
year_gap = 1.0
x_positions = []
year_centers = {}
year_spans = {}
cursor = 0.0
for year, group in by_year.groupby("rfs_year", sort=True):
    start = cursor
    for _ in range(len(group)):
        x_positions.append(cursor)
        cursor += 1.0
    end = cursor - 1.0
    year_centers[year] = 0.5 * (start + end)
    year_spans[year] = (start - 0.5, end + 0.5)
    cursor += year_gap

by_year = by_year.reset_index(drop=True)
by_year["x"] = x_positions

fig, ax = plt.subplots(figsize=(20, 10), facecolor="#090A18")
ax.set_facecolor("#090A18")
ax.bar(
    by_year["x"],
    by_year["length_km"].astype(float),
    width=0.35,
    color=by_year["bar_color"].tolist(),
    edgecolor=by_year["bar_color"].tolist(),
    linewidth=0.35,
)

# Separators between years
ymax = float(by_year["length_km"].max())
for year, (left, right) in year_spans.items():
    ax.axvline(
        right + year_gap / 2.0, color="#FFFFFF", alpha=0.08, linewidth=0.8, zorder=0
    )

year_counts = by_year.groupby("rfs_year").size().to_dict()
tick_years = sorted(year_centers)
ax.set_xticks([year_centers[y] for y in tick_years])
ax.set_xticklabels(
    [f"{y}\n(n={year_counts[y]})" for y in tick_years],
    rotation=0,
    ha="center",
    color="#FFFFFF",
    fontsize=7,
)

ax.set_title(
    "Submarine cable systems grouped by ready-for-service year",
    color="#FFFFFF",
    loc="left",
)
ax.set_xlabel(
    "Ready-for-service year (each bar = one cable in that year)", color="#FFFFFF"
)
ax.set_ylabel("Length (km)", color="#FFFFFF")
ax.tick_params(axis="y", colors="#FFFFFF")
ax.spines["bottom"].set_color("#FFFFFF")
ax.spines["left"].set_color("#FFFFFF")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)
ax.yaxis.set_major_locator(MultipleLocator(2500))
ax.set_axisbelow(True)
ax.grid(axis="y", which="major", color="#FFFFFF", alpha=0.25)
ownership_legend(ax, on_figure=False)

plt.tight_layout()
fig.savefig(
    "01-.png",
    dpi=600,
    facecolor="#090A18",
    edgecolor="none",
)
plt.show()
plt.close(fig)

# Explicit membership list: which cables belong to each year
membership_rows = []
for year, group in by_year.groupby("rfs_year", sort=True):
    cable_bits = [
        f"{name} ({length:.0f} km, {own})"
        for name, length, own in zip(
            group["name"], group["length_km"], group["ownership_group"]
        )
    ]
    membership_rows.append(
        {
            "year": int(year),
            "n": len(group),
            "cables (name, length, ownership)": "; ".join(cable_bits),
        }
    )
cables_by_year = pd.DataFrame(membership_rows)

print(
    f"Cables plotted chronologically: {len(by_year):,} "
    f"across {by_year['rfs_year'].nunique()} years"
)
print()
print("Cables included in each ready-for-service year:")
pd.set_option("display.max_colwidth", 240)
pd.set_option("display.max_rows", 200)
display(cables_by_year)