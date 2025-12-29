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

            document.body.classList.remove('theme-rs', 'theme-osrs', 'theme-rsc');
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
        const legendFormatter = (data, legendLabel) => {
            if (!data.x) return '';

            const date = new Date(data.xHTML).toLocaleString(config.locale, config.dateOptions);
            const average = data.series[0].yHTML.average;
            const change = data.series[0].yHTML.change;

            return `<div class="dygraph-legend-date">${date}</div>` +
                   `<div class="dygraph-legend-views">${legendLabel}: ${average}</div>` +
                   `<div class="dygraph-legend-change">7-day change: ${change}</div>`;
        };
        const annotationMouseOverHandler = (annotation) => {
            annotation.div.classList.remove('tooltip-hidden');
            annotation.div.style.zIndex = '100';
        };
        const annotationMouseOutHandler = (annotation) => {
            annotation.div.classList.add('tooltip-hidden');
            annotation.div.style.removeProperty('z-index');
        };

        function basicGraphConfig(containerSelector, legendLabel, lineColor) {
            return {
                color: lineColor,
                strokeWidth: 3,
                axes: config.axes,
                axisLineColor: config.gridColor,
                gridLineColor: config.gridColor,
                gridLineWidth: 1,
                highlightCircleSize: 5,
                xRangePad: 4,
                labelsDiv: get(`${containerSelector} .dygraph-legend`),
                rollPeriod: 7,
                fillGraph: true,
                legendFormatter: (data) => legendFormatter(data, legendLabel),
                interactionModel: touchInteractionModel,
                annotationMouseOverHandler: (annotation) => annotationMouseOverHandler(annotation),
                annotationMouseOutHandler: (annotation) => annotationMouseOutHandler(annotation),
            };
        }

        function appendXAxisLabels(containerSelector) {
            const xAxisLabels = get(`${containerSelector} .dygraph-x-labels`);

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

            yAxisLabels.classList.add('dygraph-y-labels');

            for (let i = maxValue; i >= 0; i--) {
                const viewLabel = document.createElement('div');
                viewLabel.classList.add('y-label');
                viewLabel.textContent = i + (i !== 0 ? unit : '');
                yAxisLabels.appendChild(viewLabel);
            }

            get(`${containerSelector} .dygraph-graph`).appendChild(yAxisLabels);
        }

        function calculate7DayChange(currentValue, previousValue, row) {
            if (row < 7) return 'N/A';

            const change = Math.round((currentValue - previousValue) / previousValue * 100);
            const sign = change < 0 ? '−' : '+';

            return sign + Math.abs(change) + '%';
        }

        function createValueFormatter(locale) {
            return function(num, opts, series, graph, row, col) {
                const currentValue = graph.getValue(row, col);
                const oneWeekAgo = graph.getValue(row - 7, col);
                const change = calculate7DayChange(currentValue, oneWeekAgo, row);

                return {
                    actual: currentValue.toLocaleString(locale),
                    average: Math.round(num).toLocaleString(locale),
                    change: change
                };
            };
        }

        function createAnnotations(annotations, seriesName) {
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
            const dateNode = document.createElement('div');
            const textNode = document.createElement('div');

            dateNode.classList.add('tooltip-date');
            dateNode.textContent = new Date(date).toLocaleString(config.locale, config.dateOptions);
            textNode.textContent = text;

            tooltip.classList.add('tooltip');
            tooltip.appendChild(dateNode);
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

        const trafficAnnotations = createAnnotations([
            { x: "2021/01/04", text: "RuneScape's 20th anniversary events begin" },
            { x: "2021/02/22", text: "RuneScape: Azzanadra's Quest is released" },
            { x: "2021/05/26", text: "Old School: Clans system is released" },
            { x: "2021/06/16", text: "Old School: A Kingdom Divided is released" },
            { x: "2021/07/26", text: "RuneScape: Nodon Front is released" },
            { x: "2021/10/06", text: "Old School: Group Ironman Mode is released", tickHeight: 33 },
            { x: "2021/10/25", text: "RuneScape: TzekHaar Front is released" },
            { x: "2021/11/25", text: "Old School: Android client beta testing begins" },
        ], 'Pageviews');
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
            get('.traffic .dygraph-graph'),
            './data/traffic.csv',
            trafficGraphConfig
        );

        // =================
        //       EDITS
        // =================

        const editsGraphConfig = {
            ...basicGraphConfig('.edits', 'Edits', 'hsl(139.76, 69.67%, 47.84%)'),
            drawCallback: (dygraph, isInitial) => {
                if (isInitial) {
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
            get('.edits .dygraph-graph'),
            './data/edits.csv',
            editsGraphConfig
        );
    }

    function initModal() {
        let pictures = getAll('picture');
        let src = 'srcFull';

        // use different image depending on if user's display supports P3
        // <https://webkit.org/blog/10042/wide-gamut-color-in-css-with-display-p3/>
        // if (window.matchMedia('(color-gamut: p3)').matches) src = 'srcFullP3';

        for (let picture of pictures) {
            picture.addEventListener('mouseover', preloadFullImage, { once: true });
            picture.addEventListener('click', openModal, false);
        }

        function preloadFullImage(event) {
            let preloader = document.createElement('link');

            preloader.href = event.currentTarget.dataset[src];
            preloader.rel = 'preload';
            preloader.as = 'image';

            document.head.appendChild(preloader);
        }

        function openModal(event) {
            let modalTemplate = get('.template-modal').content.cloneNode(true),
                modal = get('.modal', modalTemplate),
                image = get('.full-image', modalTemplate);

            modal.addEventListener('click', closeModal, false);
            image.src = event.currentTarget.dataset[src];

            //document.body.style.overflow = 'hidden';
            document.body.appendChild(modalTemplate);
            document.addEventListener('keydown', escToClose, false);
        }

        function closeModal() {
            get('.modal').remove();
            //document.body.removeAttribute('style'); // unset overflow: hidden
            document.removeEventListener('keydown', escToClose, false);
        }

        function escToClose(event) {
            if (event.code === 'Escape') closeModal();
        }
    }

    initTabs();
    initGraphs();
    initModal();
}());
