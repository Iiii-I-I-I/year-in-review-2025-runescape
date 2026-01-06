(function () {
    'use strict';

    // store graph instances for later re-rendering
    const graphInstances = {
        trafficRSW: null,
        trafficOSW: null,
        editsRSW: null,
        editsOSW: null,
    };

    function get(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function getAll(selector, scope = document) {
        return scope.querySelectorAll(selector);
    }

    // based on <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/Tab_Role>
    function initTabs() {
        let tabSwitcher = get('.tab-switcher');
        let tabButtons = [...tabSwitcher.children];
        let tabContainers = getAll('.tab-container');

        tabSwitcher.addEventListener('click', changeThemes, false);
        tabSwitcher.addEventListener('click', changeTabs, false);

        function changeThemes(event) {
            let theme = event.target.dataset.theme;

            document.body.classList.remove('theme-rs', 'theme-osrs');
            document.body.classList.add(theme);
        }

        function changeTabs(event) {
            let currTab = get('.tab[aria-selected="true"]');
            let nextTab = event.target;
            let currTabIndex = tabButtons.indexOf(currTab);
            let nextTabIndex = tabButtons.indexOf(nextTab);

            // don't move
            if (currTabIndex === nextTabIndex) return;

            // deselect current tab, select clicked tab
            currTab.setAttribute('aria-selected', false);
            nextTab.setAttribute('aria-selected', true);

            // slide tab containers
            let direction = currTabIndex > nextTabIndex ? 'left' : 'right';

            tabContainers.forEach(tabContainer => {
                slideTabPanels(tabContainer, currTab, nextTab, direction);
            });

            // move selected tab's background on .tab-switcher::before
            tabSwitcher.style.setProperty('--index', nextTabIndex);
        }

        function slideTabPanels(tabContainer, currTab, nextTab, direction) {
            let currPanel = get('.' + currTab.dataset.controls, tabContainer);
            let nextPanel = get('.' + nextTab.dataset.controls, tabContainer);
            let enterDuration = 325; // needs to match --anim-slow value
            let exitDuration = 125; // needs to match --anim-fast value

            currPanel.classList.add('slide', `slide-${direction}-fade-out`);

            window.setTimeout(function () {
                // hide old panel
                currPanel.classList.add('panel-hidden');
                currPanel.classList.remove('slide', `slide-${direction}-fade-out`);

                // reveal new panel
                nextPanel.classList.remove('panel-hidden');
                nextPanel.classList.add('slide', `slide-${direction}-fade-in`);

                // re-render hidden dygraph after panel becomes visible - see https://stackoverflow.com/questions/36337417/
                if (nextTab.dataset.controls === 'panel-rs') {
                    graphInstances.trafficRSW.resize();
                    graphInstances.editsRSW.resize();
                } else if (nextTab.dataset.controls === 'panel-osrs') {
                    graphInstances.trafficOSW.resize();
                    graphInstances.editsOSW.resize();
                }
            }, exitDuration);

            window.setTimeout(function () {
                nextPanel.classList.remove('slide', `slide-${direction}-fade-in`);
            }, enterDuration + exitDuration);
        }
    }

    // uses dygraphs library <http://dygraphs.com/>
    function initGraphs() {
        const config = {
            locale: 'en-GB',
            dateOptions: { day: 'numeric', month: 'long', year: 'numeric' },
            gridColor: 'hsl(210, 15.94%, 38.5%)',
            axes: {
                x: { drawAxis: false, drawGrid: false },
                y: { drawAxis: false, includeZero: true }
            }
        };
        const touchInteractionModel = {
            touchmove: (event) => {
                const coords = event.touches[0];
                const simulation = new MouseEvent('mousemove', {
                    clientX: coords.clientX,
                    clientY: coords.clientY
                });

                event.preventDefault();
                event.target.dispatchEvent(simulation);
            }
        };
        const legendFormatter = (data, units) => {
            if (!data.x) return '';

            const date = new Date(data.xHTML).toLocaleString(config.locale, config.dateOptions);
            const count = data.series[0].yHTML.average;

            return `<div class="graph-legend-date">${date}</div>` +
                   `<div class="graph-legend-count">${units}: ${count}</div>`;
        };
        const annotationMouseOverHandler = (annotation) => {
            annotation.div.classList.remove('tooltip-hidden');
            annotation.div.style.zIndex = '100';
        };
        const annotationMouseOutHandler = (annotation) => {
            annotation.div.classList.add('tooltip-hidden');
            annotation.div.style.removeProperty('z-index');
        };

        function basicGraphConfig(containerSelector, units, lineColor) {
            return {
                color: lineColor,
                strokeWidth: 3,
                axes: config.axes,
                axisLineColor: config.gridColor,
                gridLineColor: config.gridColor,
                gridLineWidth: 1,
                highlightCircleSize: 5,
                xRangePad: 4,
                labelsDiv: get(`${containerSelector} .graph-legend`),
                rollPeriod: 7,
                fillGraph: true,
                legendFormatter: (data) => legendFormatter(data, units),
                interactionModel: touchInteractionModel,
                annotationMouseOverHandler: (annotation) => annotationMouseOverHandler(annotation),
                annotationMouseOutHandler: (annotation) => annotationMouseOutHandler(annotation),
            };
        }

        function appendXAxisLabels(containerSelector) {
            const xAxisLabels = get(`${containerSelector} .graph-x-labels`);

            for (let i = 0; i < 12; i++) {
                const month = new Date(2021, i).toLocaleString(config.locale, { month: 'short' });
                const labelNode = document.createElement('div');
                const shortLabel = document.createElement('span');
                const longLabel = document.createElement('span');

                labelNode.classList.add('x-label');
                longLabel.classList.add('long-month');
                longLabel.textContent = month;
                shortLabel.classList.add('short-month');
                shortLabel.textContent = month.substring(0, 1);

                labelNode.appendChild(shortLabel);
                labelNode.appendChild(longLabel);
                xAxisLabels.appendChild(labelNode);
            }
        }

        function appendYAxisLabels(containerSelector, maxValue, unit) {
            const yAxisLabels = document.createElement('div');

            yAxisLabels.classList.add('graph-y-labels');

            for (let i = maxValue; i >= 0; i--) {
                const viewLabel = document.createElement('div');
                viewLabel.classList.add('y-label');
                viewLabel.textContent = i + (i !== 0 ? unit : '');
                yAxisLabels.appendChild(viewLabel);
            }

            get(`${containerSelector} .graph`).appendChild(yAxisLabels);
        }

        function createValueFormatter(locale) {
            return function(num, opts, series, graph, row, col) {
                const currentValue = graph.getValue(row, col);

                return {
                    actual: currentValue.toLocaleString(locale),
                    average: Math.round(num).toLocaleString(locale),
                };
            };
        }

        function createAnnotations(seriesName, annotations) {
            // set basic properties for all annotations
            return annotations.map((annotation, i) => {
                return {
                    ...annotation,
                    series: seriesName, // must match column name in CSV
                    shortText: i + 1,
                    width: 24,
                    height: 24,
                    cssClass: `tooltip-hidden annotation-${i + 1}`,
                    tickWidth: 2,
                    tickHeight: annotation.tickHeight || 20
                };
            });
        }

        function createTooltip(date, text) {
            const tooltip = document.createElement('div');
            const titleNode = document.createElement('div');
            const textNode = document.createElement('div');

            titleNode.classList.add('tooltip-title');
            titleNode.textContent = new Date(date).toLocaleString(config.locale, config.dateOptions);
            textNode.textContent = text;

            tooltip.classList.add('tooltip');
            tooltip.appendChild(titleNode);
            tooltip.appendChild(textNode);

            return tooltip;
        }

        function appendTooltips(containerSelector, annotations) {
            // insert tooltip inside its respective annotation, replacing hover title text
            annotations.forEach((annotation, i) => {
                const tooltip = createTooltip(annotation.x, annotation.text);
                const annotationEl = get(`${containerSelector} .annotation-${i + 1}`);

                if (annotationEl && !annotationEl.contains(tooltip)) {
                    annotationEl.appendChild(tooltip);
                    annotationEl.removeAttribute('title');
                }
            });
        }

        // =================
        //      TRAFFIC
        // =================

        const trafficAnnotations = createAnnotations('Pageviews', [
            { x: "2021/01/04", text: "RuneScape's 20th anniversary events begin" },
            { x: "2021/02/22", text: "RuneScape: Azzanadra's Quest is released" },
            { x: "2021/05/26", text: "Old School: Clans system is released" },
            { x: "2021/06/16", text: "Old School: A Kingdom Divided is released" },
            { x: "2021/07/26", text: "RuneScape: Nodon Front is released" },
            { x: "2021/10/06", text: "Old School: Group Ironman Mode is released", tickHeight: 33 },
            { x: "2021/10/25", text: "RuneScape: TzekHaar Front is released" },
            { x: "2021/11/25", text: "Old School: Android client beta testing begins" },
        ]);
        const trafficGraphConfig = (containerSelector, lineColor) => {
            return {
                ...basicGraphConfig(containerSelector, 'Views', lineColor),
                drawCallback: (dygraph, isInitial) => {
                    if (isInitial) {
                        dygraph.setAnnotations(trafficAnnotations);
                        appendXAxisLabels(containerSelector); // units are months
                        appendYAxisLabels(containerSelector, 6, 'm'); // units are millions of pageviews
                    }

                    appendTooltips(containerSelector, trafficAnnotations);
                },
                axes: {
                    ...config.axes,
                    y: {
                        ...config.axes.y,
                        valueRange: [0, 6500000],
                        valueFormatter: createValueFormatter(config.locale)
                    }
                }
            }
        };

        const trafficRSW = new Dygraph(
            get('.traffic-rsw .graph'),
            './data/traffic.csv',
            trafficGraphConfig('.traffic-rsw', 'hsl(197, 66%, 62%)')
        );

        const trafficOSW = new Dygraph(
            get('.traffic-osw .graph'),
            './data/traffic.csv',
            trafficGraphConfig('.traffic-osw', 'hsl(34, 57%, 61%)')
        );

        // store instances for tab switching
        graphInstances.trafficRSW = trafficRSW;
        graphInstances.trafficOSW = trafficOSW;

        // =================
        //       EDITS
        // =================

        const editsAnnotations = createAnnotations('Edits', [
            { x: "2021/01/04", text: "RuneScape's 20th anniversary events begin" },
            { x: "2021/02/22", text: "RuneScape: Azzanadra's Quest is released" },
            { x: "2021/07/26", text: "RuneScape: Nodon Front is released" },
            { x: "2021/08/18", text: "Is this annotation too high?", tickHeight: 180 },
            { x: "2021/10/25", text: "RuneScape: TzekHaar Front is released" },
            { x: "2021/11/25", text: "Old School: Android client beta testing begins" },
        ]);
        const editsGraphConfig = (containerSelector, lineColor) => {
            return {
                ...basicGraphConfig(containerSelector, 'Edits', lineColor),
                drawCallback: (dygraph, isInitial) => {
                    if (isInitial) {
                        dygraph.setAnnotations(editsAnnotations);
                        appendXAxisLabels(containerSelector); // units are months
                        appendYAxisLabels(containerSelector, 4, 'k'); // units are thousands of edits
                    }

                    appendTooltips(containerSelector, editsAnnotations);
                },
                axes: {
                    ...config.axes,
                    y: {
                        ...config.axes.y,
                        valueRange: [0, 4600],
                        valueFormatter: createValueFormatter(config.locale)
                    }
                }
            }
        };

        const editsRSW = new Dygraph(
            get('.edits-rsw .graph'),
            './data/edits.csv',
            editsGraphConfig('.edits-rsw', 'hsl(197, 66%, 62%)')
        );

        const editsOSW = new Dygraph(
            get('.edits-osw .graph'),
            './data/edits.csv',
            editsGraphConfig('.edits-osw', 'hsl(34, 57%, 61%)')
        );

        // store instances for tab switching
        graphInstances.editsRSW = editsRSW;
        graphInstances.editsOSW = editsOSW;
    }

    function initBarCharts() {
        function calculateRowTotal(warframe) {
            return warframe.variants.reduce((sum, v) => sum + v.pageviews, 0);
        }

        function createBarLabel(text) {
            const label = document.createElement('div');
            label.className = 'bar-label';
            label.textContent = text;

            return label;
        }

        function createBarTotal(total) {
            const barTotal = document.createElement('div');
            barTotal.className = 'bar-total';
            barTotal.textContent = total.toLocaleString();

            return barTotal;
        }

        function createBarSegment(variant, maxTotal) {
            const segment = document.createElement('div');
            const percentage = (variant.pageviews / maxTotal) * 100;
            const tooltip = createTooltip(variant);

            segment.classList.add('bar-segment', 'tooltip-hidden');
            segment.style.width = percentage + '%';
            segment.appendChild(tooltip);

            return segment;
        }

        function createBarContainer(variants, maxTotal) {
            const barContainer = document.createElement('div');
            barContainer.className = 'bar-container';

            variants.forEach(variant => {
                const segment = createBarSegment(variant, maxTotal);
                barContainer.appendChild(segment);
            });

            attachTooltipEvents(barContainer);
            return barContainer;
        }

        function createChartRow(warframe, maxTotal) {
            const row = document.createElement('div');
            row.className = 'chart-row';

            if (warframe.isNew) {
                row.classList.add('new');
            }

            const total = calculateRowTotal(warframe);

            row.appendChild(createBarLabel(warframe.name));
            row.appendChild(createBarContainer(warframe.variants, maxTotal));
            row.appendChild(createBarTotal(total));

            return row;
        }

        function createTooltip(variant) {
            const tooltip = document.createElement('div');
            const titleNode = document.createElement('div');
            const textNode = document.createElement('div');

            titleNode.classList.add('tooltip-title');
            titleNode.textContent = variant.name;
            textNode.classList.add('tooltip-text');
            textNode.textContent = variant.pageviews.toLocaleString() + ' views';

            tooltip.classList.add('tooltip');
            tooltip.appendChild(titleNode);
            tooltip.appendChild(textNode);

            return tooltip;
        }

        function attachTooltipEvents(barContainer) {
            // '.tooltip-hidden' is added/removed from the parent segment element, not the tooltip
            barContainer.addEventListener('mouseover', (e) => {
                let segment = e.target;

                if (segment.classList.contains('bar-segment')) {
                    segment.classList.remove('tooltip-hidden');
                }
            });

            barContainer.addEventListener('mouseout', (e) => {
                let segment = e.target;

                if (segment.classList.contains('bar-segment')) {
                    segment.classList.add('tooltip-hidden');
                }
            });
        }

        function renderStackedBarChart(data, container) {
            const sortedData = [...data].sort((a, b) => calculateRowTotal(b) - calculateRowTotal(a));
            const maxTotalPageviews = Math.max(...sortedData.map(wf => calculateRowTotal(wf)));

            sortedData.forEach(warframe => {
                const row = createChartRow(warframe, maxTotalPageviews);
                container.appendChild(row);
            });
        }

        function loadAndRenderChart(jsonUrl, container) {
            fetch(jsonUrl)
                .then(response => response.json())
                .then(data => renderStackedBarChart(data, container))
                .catch(error => {
                    console.error('Error loading chart data: ', error);
                    container.innerHTML = `<p>Error loading chart data: ${error}</p>`;
                });
        }

        loadAndRenderChart(
            './data/warframes.json',
            get('.warframe-test .bar-chart-container')
        );
    }

    initTabs();
    initGraphs();
    // initBarCharts();
}());
