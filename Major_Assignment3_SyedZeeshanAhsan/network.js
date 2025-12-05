function simulate(data, svg) {
    const width = parseInt(svg.attr("viewBox").split(' ')[2]);
    const height = parseInt(svg.attr("viewBox").split(' ')[3]);
    const main_group = svg.append("g")
        .attr("transform", "translate(0, 0)");

    // Filter data - exclude records missing year, affiliation, or author
    // (Note: based on the provided sample data structure, we filter nodes without country or affiliation)
    data.nodes = data.nodes.filter(d => d.country && d.affiliation && d.id);

    // Update links to only include valid nodes
    const validNodeIds = new Set(data.nodes.map(d => d.id));
    data.links = data.links.filter(d =>
        validNodeIds.has(d.source) && validNodeIds.has(d.target)
    );

    // Calculate degree of the nodes (use provided degree or calculate)
    let node_degree = {};
    data.nodes.forEach(node => {
        if (node.degree !== undefined) {
            node_degree[node.id] = node.degree;
        } else {
            node_degree[node.id] = 0;
        }
    });

    // Also count from links
    data.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;

        if (!(sourceId in node_degree)) node_degree[sourceId] = 0;
        if (!(targetId in node_degree)) node_degree[targetId] = 0;
    });

    // Get top 10 countries by number of authors
    const countryCount = {};
    data.nodes.forEach(node => {
        if (node.country) {
            countryCount[node.country] = (countryCount[node.country] || 0) + 1;
        }
    });

    const topCountries = Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(d => d[0]);

    // Mark top countries in node data
    data.nodes.forEach(node => {
        node.isTopCountry = topCountries.includes(node.country);
    });

    // Create color scale for top 10 countries
    const colorScale = d3.scaleOrdinal()
        .domain(topCountries)
        .range(d3.schemeCategory10);

    // Function to get node color
    function getNodeColor(node) {
        if (node.isTopCountry) {
            return colorScale(node.country);
        }
        return "#A9A9A9"; // Gray for non-top countries
    }

    // Create legend
    const legend = d3.select("#legend-items");
    legend.html(''); // Clear existing

    topCountries.forEach(country => {
        const item = legend.append("div").attr("class", "legend-item");
        item.append("div")
            .attr("class", "legend-color")
            .style("background-color", colorScale(country));
        item.append("span").text(country);
    });

    // Add "Others" to legend
    const othersItem = legend.append("div").attr("class", "legend-item");
    othersItem.append("div")
        .attr("class", "legend-color")
        .style("background-color", "#A9A9A9");
    othersItem.append("span").text("Others");

    // Scale for node radius based on degree
    const degreeExtent = d3.extent(Object.values(node_degree));
    const scale_radius = d3.scaleSqrt()
        .domain(degreeExtent[0] === degreeExtent[1] ? [0, degreeExtent[1]] : degreeExtent)
        .range([3, 12]);

    // Scale for link stroke width
    const scale_link_stroke_width = d3.scaleLinear()
        .domain(d3.extent(data.links, d => d.weight || 1))
        .range([1, 5]);

    // Create link elements
    const link_elements = main_group.append("g")
        .attr('class', 'links-group')
        .attr('transform', `translate(${width / 2},${height / 2})`)
        .selectAll(".line")
        .data(data.links)
        .enter()
        .append("line")
        .attr("class", "link")
        .style("stroke-width", d => scale_link_stroke_width(d.weight || 1));

    // Create node elements
    const node_elements = main_group.append("g")
        .attr('class', 'nodes-group')
        .attr('transform', `translate(${width / 2},${height / 2})`)
        .selectAll(".node")
        .data(data.nodes)
        .enter()
        .append('g')
        .attr("class", d => `node country-${d.country.replace(/\s+/g, '-')}`)
        .on("mouseenter", function(event, d) {
            // On hover, show only authors with same affiliation
            const currentCountry = d.country;
            node_elements.each(function(node) {
                const element = d3.select(this);
                if (node.country !== currentCountry) {
                    element.classed("inactive", true);
                }
            });

            link_elements.each(function(link) {
                const sourceNode = data.nodes.find(n => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
                const targetNode = data.nodes.find(n => n.id === (typeof link.target === 'object' ? link.target.id : link.target));

                const sourceCountry = typeof link.source === 'object' ? link.source.country : (sourceNode ? sourceNode.country : null);
                const targetCountry = typeof link.target === 'object' ? link.target.country : (targetNode ? targetNode.country : null);

                if (sourceCountry !== currentCountry || targetCountry !== currentCountry) {
                    d3.select(this).classed("inactive", true);
                }
            });
        })
        .on("mouseleave", function(event, d) {
            // Return to normal
            node_elements.classed("inactive", false);
            link_elements.classed("inactive", false);
        })
        .on("click", function(event, d) {
            // Show tooltip with author information
            const tooltip = d3.select("#tooltip");

            d3.select("#tooltip-author").text(d.id);
            d3.select("#tooltip-country").text(d.country);
            d3.select("#tooltip-degree").text(node_degree[d.id] || 0);
            d3.select("#tooltip-affiliation").text(d.affiliation || "N/A");

            const papersList = d3.select("#tooltip-papers");
            papersList.html('');
            if (d.papers && d.papers.length > 0) {
                d.papers.forEach(paper => {
                    papersList.append("li").text(paper);
                });
            } else {
                papersList.append("li").text("No papers listed");
            }

            // Position tooltip near the clicked node
            const [x, y] = d3.pointer(event, document.body);
            tooltip
                .style("left", (x + 15) + "px")
                .style("top", (y - 15) + "px")
                .style("display", "block");

            event.stopPropagation();
        })
        .call(d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended));

    // Add circles to nodes
    node_elements.append("circle")
        .attr("r", d => scale_radius(node_degree[d.id] || 0))
        .attr("fill", d => getNodeColor(d))
        .attr("class", "node-circle");

    // Add labels to nodes
    node_elements.append("text")
        .attr("class", "label")
        .attr("text-anchor", "middle")
        .attr("dy", d => scale_radius(node_degree[d.id] || 0) + 10)
        .text(d => d.id);

    // Initialize force simulation parameters
    let chargeStrength = -100;
    let collideMultiplier = 2.5;
    let linkStrengthValue = 0.3;

    // Create force simulation
    let ForceSimulation = d3.forceSimulation(data.nodes)
        .force("collide",
            d3.forceCollide().radius(d => scale_radius(node_degree[d.id] || 0) * collideMultiplier)
        )
        .force("x", d3.forceX())
        .force("y", d3.forceY())
        .force("charge", d3.forceManyBody().strength(chargeStrength))
        .force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(50)
            .strength(linkStrengthValue)
        )
        .on("tick", ticked);

    function ticked() {
        node_elements
            .attr('transform', d => `translate(${d.x},${d.y})`);

        link_elements
            .attr("x1", d => d.source.x)
            .attr("x2", d => d.target.x)
            .attr("y1", d => d.source.y)
            .attr("y2", d => d.target.y);
    }

    // Drag functions
    function dragstarted(event, d) {
        if (!event.active) ForceSimulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    function dragended(event, d) {
        if (!event.active) ForceSimulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    // Zoom functionality
    svg.call(d3.zoom()
        .extent([
            [0, 0],
            [width, height]
        ])
        .scaleExtent([0.5, 8])
        .on("zoom", zoomed));

    function zoomed({ transform }) {
        main_group.attr("transform", transform);
    }

    // UI Controls
    const chargeSlider = d3.select("#charge-slider");
    const chargeValue = d3.select("#charge-value");

    chargeSlider.on("input", function() {
        chargeStrength = +this.value;
        chargeValue.text(chargeStrength);
        ForceSimulation.force("charge", d3.forceManyBody().strength(chargeStrength));
        ForceSimulation.alpha(0.3).restart();
    });

    const collideSlider = d3.select("#collide-slider");
    const collideValue = d3.select("#collide-value");

    collideSlider.on("input", function() {
        collideMultiplier = +this.value;
        collideValue.text(collideMultiplier);
        ForceSimulation.force("collide",
            d3.forceCollide().radius(d => scale_radius(node_degree[d.id] || 0) * collideMultiplier)
        );
        ForceSimulation.alpha(0.3).restart();
    });

    const linkSlider = d3.select("#link-slider");
    const linkValue = d3.select("#link-value");

    linkSlider.on("input", function() {
        linkStrengthValue = +this.value;
        linkValue.text(linkStrengthValue);
        ForceSimulation.force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(50)
            .strength(linkStrengthValue)
        );
        ForceSimulation.alpha(0.3).restart();
    });

    // Close tooltip when clicking elsewhere
    d3.select("body").on("click", function() {
        d3.select("#tooltip").style("display", "none");
    });
}