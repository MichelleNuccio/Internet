from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib.cm import ScalarMappable

ocean = xr.open_dataset(OCEAN_FILE)
chlorophyll = (
    ocean["chl"]
    .isel(time=0, depth=0)
    .where(ocean["chl"].isel(time=0, depth=0) > 0)
    .load()
)
chlorophyll_date = pd.to_datetime(ocean["time"].values[0]).strftime("%Y-%m-%d")
chlorophyll_depth = float(ocean["depth"].values[0])
pattern_levels = [
    float(chlorophyll.quantile(q, skipna=True)) for q in [0.0, 0.2, 0.4, 0.6, 0.8, 1.0]
]
pattern_labels = ["Very low", "Low", "Medium", "High", "Very high"]
pattern_strides = [12, 9, 7, 5, 3]  # smaller stride = closer marks
slash_marker = MarkerPath(
    [[-0.5, -0.5], [0.5, 0.5]], [MarkerPath.MOVETO, MarkerPath.LINETO]
)

ebsa = gpd.read_file(EBSA_FILE).set_crs("OGC:CRS84", allow_override=True)

# Match every route to status and ready-for-service year
map_metadata = pd.DataFrame(
    json.loads(METADATA_FILE.read_text(encoding="utf-8"))["records"]
)[["id", "is_planned", "rfs_year"]]
map_metadata["rfs_year"] = pd.to_numeric(map_metadata["rfs_year"], errors="coerce")
cables_by_year = cables.merge(map_metadata, on="id", how="left")
in_service_by_year = cables_by_year[~cables_by_year["is_planned"].fillna(False)].copy()
planned_by_year = cables_by_year[cables_by_year["is_planned"].eq(True)].copy()

year_min = float(cables_by_year["rfs_year"].min())
year_max = float(cables_by_year["rfs_year"].max())
year_norm = Normalize(vmin=year_min, vmax=year_max)
blue_by_year = LinearSegmentedColormap.from_list(
    "cable_blue_by_year", ["#2B45C3", "#D4D4FF"]
)
violet_by_year = LinearSegmentedColormap.from_list(
    "cable_violet_by_year", ["#F700FF", "#F700FF"]
)

gmrt = xr.open_dataset(BATHYMETRY_FILE)
gmrt_width, gmrt_height = [int(value) for value in gmrt["dimension"].values]
gmrt_longitude = np.linspace(
    gmrt["x_range"].values[0], gmrt["x_range"].values[1], gmrt_width
)
gmrt_latitude = np.linspace(
    gmrt["y_range"].values[1], gmrt["y_range"].values[0], gmrt_height
)
gmrt_elevation = gmrt["z"].values.reshape(gmrt_height, gmrt_width)
gmrt_bathymetry = np.where(gmrt_elevation < 0, gmrt_elevation, np.nan)
bathymetry_levels = [
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

fig, ax = plt.subplots(figsize=(30, 16), dpi=600, facecolor="#090A18")
ax.set_facecolor("#090A18")

longitude_grid, latitude_grid = np.meshgrid(
    ocean["longitude"].values, ocean["latitude"].values
)
chlorophyll_values = chlorophyll.values
for class_index, stride in enumerate(pattern_strides):
    sample = (slice(None, None, stride), slice(None, None, stride))
    sampled_values = chlorophyll_values[sample]
    lower = pattern_levels[class_index]
    upper = pattern_levels[class_index + 1]
    if class_index == len(pattern_strides) - 1:
        class_mask = (sampled_values >= lower) & (sampled_values <= upper)
    else:
        class_mask = (sampled_values >= lower) & (sampled_values < upper)
    class_mask &= np.isfinite(sampled_values)
    ax.scatter(
        longitude_grid[sample][class_mask],
        latitude_grid[sample][class_mask],
        marker=slash_marker,
        s=7,
        facecolors="none",
        edgecolors="#FF00D4",
        linewidths=0.28,
        alpha=0,
        zorder=0,
    )

# GMRT bathymetric contours
ax.contour(
    gmrt_longitude,
    gmrt_latitude,
    gmrt_bathymetry,
    levels=bathymetry_levels,
    colors="#FFC8F7",
    linewidths=0.25,
)

# In-service cables: blue intensity scales with RFS year
in_service_by_year.plot(
    ax=ax,
    column="rfs_year",
    cmap=blue_by_year,
    norm=year_norm,
    linewidth=1,
    alpha=0.88,
    zorder=2,
    legend=False,
    missing_kwds={"color": "#9AA0A6", "linewidth": 0.28, "alpha": 0.45},
)

# Planned cables: violet intensity scales with RFS year
planned_by_year.plot(
    ax=ax,
    column="rfs_year",
    cmap=violet_by_year,
    norm=year_norm,
    linewidth=1,
    alpha=0.22,
    zorder=2.8,
    legend=False,
    missing_kwds={"color": "#C9B0D9", "linewidth": 1.6, "alpha": 0.18},
)
planned_by_year.plot(
    ax=ax,
    column="rfs_year",
    cmap=violet_by_year,
    norm=year_norm,
    linewidth=0.35,
    linestyle="--",
    alpha=1.0,
    zorder=3,
    legend=False,
    missing_kwds={
        "color": "#9AA0A6",
        "linewidth": 0.28,
        "linestyle": "--",
        "alpha": 0.55,
    },
)

ax.set_xlim(-180, 180)
ax.set_ylim(-70, 85)
ax.set_title(
    f"Cable routes by RFS year intensity, EBSAs and surface chlorophyll - {chlorophyll_date}",
    color="#111111",
    fontsize=18,
    pad=14,
)
ebsa_handle = Line2D(
    [0],
    [0],
    linestyle="none",
    marker="+",
    markersize=6,
    markeredgewidth=0.45,
    color="#00DFF2",
    label="CBD EBSA",
)
cable_handles = [
    Line2D(
        [0], [0], color="#0015FF", linewidth=1.4, label="In service (darker = newer)"
    ),
    Line2D(
        [0],
        [0],
        color="#FF44E0",
        linewidth=1.4,
        linestyle="--",
        label="Planned (darker = newer)",
    ),
]
chlorophyll_handle = Line2D(
    [0],
    [0],
    linestyle="none",
    marker=slash_marker,
    markersize=7,
    markeredgewidth=0.4,
    markeredgecolor="#FF00D4",
    label="Surface chlorophyll",
)

plt.setp(legend.get_texts(), color="#222222")
legend.get_title().set_color("#111111")

# Colour bar for ready-for-service year
sm = ScalarMappable(norm=year_norm, cmap=blue_by_year)
sm.set_array([])
cbar = fig.colorbar(
    sm,
    ax=ax,
    orientation="horizontal",
    fraction=0.035,
    pad=0.02,
    aspect=42,
)
cbar.set_label("Ready-for-service year (colour intensity)", color="#222222")
cbar.ax.xaxis.set_tick_params(color="#444444")
plt.setp(cbar.ax.get_xticklabels(), color="#333333")

fig.text(
    0.01,
    0.01,
    "Sources: TeleGeography; E.U. Copernicus Marine Service (CMEMS); GMRT v4.5; CBD EBSA Repository",
    color="#666666",
    fontsize=9,
)
ax.set_axis_off()
plt.tight_layout(rect=[0, 0.075, 1, 1])
ocean.close()
gmrt.close()
plt.show()

print(
    f"Rendered year-scaled routes — in service: {len(in_service_by_year):,}; "
    f"planned: {len(planned_by_year):,}; "
    f"RFS year range: {int(year_min)}-{int(year_max)}"
)