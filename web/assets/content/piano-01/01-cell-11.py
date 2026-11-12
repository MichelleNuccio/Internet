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

# Match every route to the planned/in-service status supplied by TeleGeography
map_metadata = pd.DataFrame(
    json.loads(METADATA_FILE.read_text(encoding="utf-8"))["records"]
)[["id", "is_planned"]]
cables_by_status = cables.merge(map_metadata, on="id", how="left")
in_service_cables = cables_by_status[~cables_by_status["is_planned"].fillna(False)]
planned_cables = cables_by_status[cables_by_status["is_planned"].eq(True)]

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
bathymetry_levels = [-8000, -6000, -4000, -2000, -1000, -500, -200, -100]

fig, ax = plt.subplots(figsize=(18, 9), facecolor="white")
ax.set_facecolor("white")

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
        alpha=0.72,
        zorder=0,
    )

# GMRT bathymetric contours
ax.contour(
    gmrt_longitude,
    gmrt_latitude,
    gmrt_bathymetry,
    levels=bathymetry_levels,
    colors="#5A5A5A",
    linewidths=0.34,
)

# CBD EBSAs: small cyan crosses, without polygon borders
ebsa_pattern_geometry = ebsa.geometry.make_valid().union_all()
ebsa_pattern_longitudes = np.arange(-179.25, 180, 1.5)
ebsa_pattern_latitudes = np.arange(-69.25, 85, 1.5)
ebsa_pattern_x, ebsa_pattern_y = np.meshgrid(
    ebsa_pattern_longitudes, ebsa_pattern_latitudes
)
ebsa_pattern_mask = contains_xy(
    ebsa_pattern_geometry,
    ebsa_pattern_x.ravel(),
    ebsa_pattern_y.ravel(),
)
ax.scatter(
    ebsa_pattern_x.ravel()[ebsa_pattern_mask],
    ebsa_pattern_y.ravel()[ebsa_pattern_mask],
    marker="+",
    s=7,
    color="#00FFFB",
    linewidths=0.34,
    alpha=0.72,
    zorder=0.8,
)

# Existing cable routes in electric blue
in_service_cables.plot(
    ax=ax,
    color="#0015FF",
    linewidth=0.35,
    alpha=0.82,
    zorder=2,
)

# Planned future cable routes: violet glow and crisp foreground
planned_cables.plot(
    ax=ax,
    color="#C45CFF",
    linewidth=2.2,
    alpha=0.24,
    zorder=2.8,
)
planned_cables.plot(
    ax=ax,
    color="#8300FF",
    linewidth=0.35,
    linestyle="--",
    alpha=1.0,
    zorder=3,
)

ax.set_xlim(-180, 180)
ax.set_ylim(-70, 85)
ax.set_title(
    f"Global submarine cable routes, EBSAs and surface chlorophyll - {chlorophyll_date}",
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
    Line2D([0], [0], color="#0015FF", linewidth=1, label="In service cables"),
    Line2D(
        [0], [0], color="#8300FF", linewidth=1, linestyle="--", label="Planned cables"
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
legend = ax.legend(
    handles=[*cable_handles, ebsa_handle, chlorophyll_handle],
    title="Map layers",
    loc="lower center",
    bbox_to_anchor=(0.5, -0.105),
    ncol=4,
    frameon=False,
)
plt.setp(legend.get_texts(), color="#222222")
legend.get_title().set_color("#111111")
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
    f"Rendered cable routes — in service: {len(in_service_cables):,}; "
    f"planned in violet: {len(planned_cables):,}"
)