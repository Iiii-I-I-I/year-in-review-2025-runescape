(function () {
    'use strict';

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

            // hide old panel, reveal new panel
            currPanel.classList.add('slide', `slide-${direction}-fade-out`);

            window.setTimeout(function () {
                currPanel.setAttribute('hidden', '');
                currPanel.classList.remove('slide', `slide-${direction}-fade-out`);
                nextPanel.removeAttribute('hidden');
                nextPanel.classList.add('slide', `slide-${direction}-fade-in`);
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
        const trafficGraphConfig = {
            ...basicGraphConfig('.traffic', 'Views', 'hsl(18.65, 91.72%, 63.78%)'),
            drawCallback: (dygraph, isInitial) => {
                if (isInitial) {
                    dygraph.setAnnotations(trafficAnnotations);
                    appendTooltips('.traffic', trafficAnnotations);
                    appendXAxisLabels('.traffic'); // units are months
                    appendYAxisLabels('.traffic', 6, 'm'); // units are millions of pageviews
                }
            },
            axes: {
                ...config.axes,
                y: {
                    ...config.axes.y,
                    valueRange: [0, 6500000],
                    valueFormatter: createValueFormatter(config.locale)
                }
            }
        };

        new Dygraph(
            get('.traffic .graph'),
            './data/traffic.csv',
            trafficGraphConfig
        );

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
        const editsGraphConfig = {
            ...basicGraphConfig('.edits', 'Edits', 'hsl(139.76, 69.67%, 47.84%)'),
            drawCallback: (dygraph, isInitial) => {
                if (isInitial) {
                    dygraph.setAnnotations(editsAnnotations);
                    appendTooltips('.edits', editsAnnotations);
                    appendXAxisLabels('.edits'); // units are months
                    appendYAxisLabels('.edits', 4, 'k'); // units are thousands of edits
                }
            },
            axes: {
                ...config.axes,
                y: {
                    ...config.axes.y,
                    valueRange: [0, 4600],
                    valueFormatter: createValueFormatter(config.locale)
                }
            }
        };

        new Dygraph(
            get('.edits .graph'),
            './data/edits.csv',
            editsGraphConfig
        );
    }

    function initBarCharts() {
        function calculateTotalPageviews(warframe) {
            return warframe.variants.reduce((sum, v) => sum + v.pageviews, 0);
        }

        function createBarLabel(text) {
            const label = document.createElement('div');
            label.className = 'bar-label';
            label.textContent = text;

            return label;
        }

        function createBarTotal(total) {
            const totalViews = document.createElement('div');
            totalViews.className = 'total-views';
            totalViews.textContent = total.toLocaleString();

            return totalViews;
        }

        function createBarSegment(variant, maxTotal, tooltip) {
            const segment = document.createElement('div');
            const percentage = (variant.pageviews / maxTotal) * 100;

            segment.className = 'bar-segment';
            segment.style.width = percentage + '%';
            attachTooltipEvents(segment, variant, tooltip);

            return segment;
        }

        function createBarContainer(variants, maxTotal, tooltip) {
            const barContainer = document.createElement('div');
            barContainer.className = 'bar-container';

            variants.forEach(variant => {
                const segment = createBarSegment(variant, maxTotal, tooltip);
                barContainer.appendChild(segment);
            });

            return barContainer;
        }

        function createChartRow(warframe, maxTotal, tooltip) {
            const row = document.createElement('div');
            row.className = 'chart-row';

            if (warframe.isNew) {
                row.classList.add('new');
            }

            const total = calculateTotalPageviews(warframe);

            row.appendChild(createBarLabel(warframe.name));
            row.appendChild(createBarContainer(warframe.variants, maxTotal, tooltip));
            row.appendChild(createBarTotal(total));

            return row;
        }

        function attachTooltipEvents(segment, variant, tooltip) {
            segment.addEventListener('mouseenter', () => {
                showTooltip(segment, variant, tooltip);
            });

            segment.addEventListener('mouseleave', () => {
                segment.classList.add('tooltip-hidden');
            });
        }

        function showTooltip(segment, variant, tooltip) {
            tooltip.querySelector('.tooltip-title').textContent = variant.name;
            tooltip.querySelector('.tooltip-text').textContent = variant.pageviews.toLocaleString() + ' views';

            segment.appendChild(tooltip);
            segment.classList.remove('tooltip-hidden');
        }

        function renderStackedBarChart(data, container, tooltip) {
            const sortedData = [...data].sort((a, b) => calculateTotalPageviews(b) - calculateTotalPageviews(a));
            const maxTotalPageviews = Math.max(...sortedData.map(wf => calculateTotalPageviews(wf)));

            sortedData.forEach(warframe => {
                const row = createChartRow(warframe, maxTotalPageviews, tooltip);
                container.appendChild(row);
            });
        }

        function loadAndRenderChart(jsonUrl, container, tooltip) {
            fetch(jsonUrl)
                .then(response => response.json())
                .then(data => renderStackedBarChart(data, container, tooltip))
                .catch(error => {
                    console.error('Error loading chart data: ', error);
                    container.innerHTML = `<p>Error loading chart data: ${error}</p>`;
                });
        }

        loadAndRenderChart(
            './data/warframes.json',
            get('.warframe-test .bar-chart-container'),
            get('.tooltip.warframe-test-tooltip')
        );
    }

    initTabs();
    initGraphs();
    initBarCharts();
}());
