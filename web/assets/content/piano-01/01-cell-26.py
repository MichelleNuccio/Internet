from matplotlib.ticker import MultipleLocator

yearly = (
    metadata.dropna(subset=["rfs_year", "status"])
    .groupby(["rfs_year", "status"])
    .size()
    .unstack(fill_value=0)
    .sort_index()
)

x = range(len(yearly.index))
in_service = yearly.get("In service", pd.Series(0, index=yearly.index))
planned = yearly.get("Planned", pd.Series(0, index=yearly.index))

fig, ax = plt.subplots(figsize=(18, 10), facecolor="#090A18")
ax.set_facecolor("#090A18")
ax.bar(
    x,
    in_service,
    width=0.82,
    facecolor="none",
    edgecolor="#FF96FF",
    linewidth=1.5,
    label="In service",
)
ax.bar(
    x,
    planned,
    bottom=in_service,
    width=0.82,
    facecolor="none",
    edgecolor="#FFFFFF",
    linewidth=1.5,
    label="Planned",
)

ax.set_title("Submarine cable systems by ready-for-service year", color="#FFFFFF")
ax.set_xlabel("Ready-for-service year", color="#FFFFFF")
ax.set_ylabel("Number of cable systems", color="#FFFFFF")

legend = ax.legend(
    title="Status", facecolor="#090A18", edgecolor="#FFFFFF", labelcolor="#FFFFFF"
)
legend.get_title().set_color("#FFFFFF")

ax.set_xticks(list(x))
ax.set_xticklabels(
    yearly.index.astype(str), rotation=90, ha="center", va="top", color="#FFFFFF"
)
ax.tick_params(axis="y", colors="#FFFFFF")
ax.spines["bottom"].set_color("#FFFFFF")
ax.spines["left"].set_color("#FFFFFF")
ax.spines["top"].set_visible(False)
ax.spines["right"].set_visible(False)

ax.yaxis.set_major_locator(MultipleLocator(5))
ax.set_axisbelow(True)
ax.grid(axis="y", which="major", color="#FFFFFF", alpha=0.25)

plt.tight_layout()
plt.show()

print(f"Cable records without an RFS year: {metadata['rfs_year'].isna().sum():,}")