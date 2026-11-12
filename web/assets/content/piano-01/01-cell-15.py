# Ownership-coloured copy of the 3B landing-point map (same palette, meaningful colours)
download_if_missing(LANDING_POINTS_URL, LANDING_POINTS_FILE)
landing_points_own = gpd.read_file(LANDING_POINTS_FILE).to_crs("EPSG:4326")

neon_palette = [
    "#F15BB5",  # magenta  -> telco / consortium
    "#00CFE8",  # cyan  -> Microsoft
    "#1C8CFF",  # blue  -> Google
    "#9B5DE5",  # violet -> multiple big tech
    "#FEE440",  # pink  -> Meta
    "#56E0C5",  # mint (unused spare)
    "#FEE440",  # yellow -> landing points (kept)
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


ownership_meta = pd.DataFrame(
    json.loads(METADATA_FILE.read_text(encoding="utf-8"))["records"]
)[["id", "is_planned", "owners", "name"]]

owned_cables = cables.merge(ownership_meta, on="id", how="left", suffixes=("", "_meta"))
if (
    "is_planned" not in owned_cables.columns
    and "is_planned_meta" in owned_cables.columns
):
    owned_cables["is_planned"] = owned_cables["is_planned_meta"]
owned_cables["ownership_group"] = owned_cables["owners"].apply(ownership_group)
owned_cables["cable_color"] = owned_cables["ownership_group"].map(ownership_colors)

owned_in_service = owned_cables[~owned_cables["is_planned"].fillna(False)]
owned_planned = owned_cables[owned_cables["is_planned"].eq(True)]

gmrt_own = xr.open_dataset(BATHYMETRY_FILE)
gmrt_w, gmrt_h = [int(value) for value in gmrt_own["dimension"].values]
gmrt_lon = np.linspace(
    gmrt_own["x_range"].values[0], gmrt_own["x_range"].values[1], gmrt_w
)
gmrt_lat = np.linspace(
    gmrt_own["y_range"].values[1], gmrt_own["y_range"].values[0], gmrt_h
)
gmrt_elev = gmrt_own["z"].values.reshape(gmrt_h, gmrt_w)
gmrt_bathy = np.where(gmrt_elev < 0, gmrt_elev, np.nan)
bathymetry_levels_own = [
    -8000,
    -7000,
    -6000,
    -5000,
    -4000,
    -3000,
    -2000,
    -1000,
    -900,
    -800,
    -700,
    -600,
    -500,
    -400,
    -300,
    -200,
    -100,
]

fig, ax = plt.subplots(figsize=(30, 16), dpi=180, facecolor="#090A18")
ax.set_facecolor("#090A18")
ax.contour(
    gmrt_lon,
    gmrt_lat,
    gmrt_bathy,
    levels=bathymetry_levels_own,
    colors="#30344F",
    linewidths=0.35,
    alpha=0.75,
    zorder=0,
)

# Draw telco routes first (context), then big-tech categories on top
draw_order = [
    "Telco / consortium",
    "Unknown",
    "Amazon",
    "Microsoft",
    "Meta",
    "Google",
    "Multiple big tech",
]
for group_name in draw_order:
    group_service = owned_in_service[owned_in_service["ownership_group"].eq(group_name)]
    group_planned = owned_planned[owned_planned["ownership_group"].eq(group_name)]
    if len(group_service):
        alpha = 0.35 if group_name in {"Telco / consortium", "Unknown"} else 0.92
        width = 1.2 if group_name in {"Telco / consortium", "Unknown"} else 0.70
        group_service.plot(
            ax=ax,
            color=ownership_colors[group_name],
            linewidth=width,
            alpha=alpha,
            zorder=2,
        )
    if len(group_planned):
        alpha = 0.45 if group_name in {"Telco / consortium", "Unknown"} else 0.95
        width = 1.2 if group_name in {"Telco / consortium", "Unknown"} else 0.90
        group_planned.plot(
            ax=ax,
            color=ownership_colors[group_name],
            linewidth=width,
            linestyle="--",
            alpha=alpha,
            zorder=2.5,
        )

ax.scatter(
    landing_points_own.geometry.x,
    landing_points_own.geometry.y,
    marker="+",
    s=11,
    color="#FFFFFF",
    linewidths=0.5,
    alpha=0.95,
    zorder=4,
)

ownership_handles = [
    Line2D([0], [0], color=ownership_colors[name], linewidth=2.2, label=name)
    for name in [
        "Telco / consortium",
        "Google",
        "Meta",
        "Microsoft",
        "Amazon",
        "Multiple big tech",
    ]
]
landing_handle_own = Line2D(
    [0],
    [0],
    linestyle="none",
    marker="+",
    markersize=7,
    markeredgewidth=0.8,
    color="#FFFFFF",
    label="Landing point",
)
planned_handle_own = Line2D(
    [0],
    [0],
    color="#B7F4E8",
    linewidth=1.2,
    linestyle="--",
    label="Planned route",
)
legend = ax.legend(
    handles=[*ownership_handles, landing_handle_own, planned_handle_own],
    loc="lower center",
    bbox_to_anchor=(0.5, -0.075),
    ncol=8,
    frameon=False,
    fontsize=15,
)
plt.setp(legend.get_texts(), color="#FFFFFF")

ax.set_axis_off()
plt.tight_layout(rect=[0, 0.055, 1, 1])
gmrt_own.close()
plt.show()

counts = owned_cables.drop_duplicates("id")["ownership_group"].value_counts()
print("Cable systems by ownership group:")
print(counts.to_string())
print(f"Rendered {len(owned_cables):,} route features with ownership colours.")