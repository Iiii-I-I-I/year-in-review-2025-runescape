(function () {
    'use strict';

    function get(selector, scope = document) {
        return scope.querySelector(selector);
    }

    function getAll(selector, scope = document) {
        return scope.querySelectorAll(selector);
    }

    // lets the reader use arrow keys to focus elements inside a target element,
    // requires the target element to have .focus and .elements properties
    // eg. parent.focus = 0;
    //     parent.elements = parent.querySelector('.elements-to-focus-on');
    //     parent.addEventListener('keydown', keyHandler);
    function keyHandler(event) {
        let target = event.currentTarget,
            elements = target.elements,
            key = event.code;

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            event.preventDefault(); // stop page from scrolling with arrow keys
            elements[target.focus].setAttribute('tabindex', -1);

            // move to next element
            if (['ArrowDown', 'ArrowRight'].includes(key)) {
                target.focus++;

                // if at the end, move to the start
                if (target.focus >= elements.length) {
                    target.focus = 0;
                }
            }
            // move to previous element
            else if (['ArrowUp', 'ArrowLeft'].includes(key)) {
                target.focus--;

                // if at the start, move to the end
                if (target.focus < 0) {
                    target.focus = elements.length - 1;
                }
            }

            elements[target.focus].setAttribute('tabindex', 0);
            elements[target.focus].focus();
        }
    }

    // based on <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/Tab_Role>
    function initTabs() {
        let tabSwitcher = get('.tab-switcher');
        let tabButtons = [...tabSwitcher.children];

        tabSwitcher.addEventListener('click', changeTabs, false);

        // make tabs keyboard accessible
        // tabSwitcher.focus = 0;
        // tabSwitcher.elements = getAll('.tab', tabSwitcher);
        // tabSwitcher.addEventListener('keydown', keyHandler, false);

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
            let tabContainers = getAll('.tab-container');
            let direction = currTabIndex > nextTabIndex ? 'left' : 'right';

            tabContainers.forEach(tabContainer => {
                slideTabPanels(tabContainer, currTab, nextTab, direction);
            });

            // move selected tab's background on .tab-switcher::before
            tabSwitcher.style.setProperty('--index', nextTabIndex);
        }

        function slideTabPanels(tabContainer, currTab, nextTab, direction) {
            let currPanel = get('.' + currTab.getAttribute('data-controls'), tabContainer),
                nextPanel = get('.' + nextTab.getAttribute('data-controls'), tabContainer),
                enterDuration = 350, // --anim-slow
                exitDuration = 125; // --anim-fast

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
        let trafficData = './data/traffic.csv',
            siteSpeedData = './data/site-speed.csv',
            editsData = './data/edits.csv',
            gridColor = 'hsl(210, 15.94%, 38.5%)',
            locale = 'en-GB',
            dateOptions = {
                day: 'numeric',
                month: 'long'
            };

        // draw traffic graph
        let trafficGraph = new Dygraph(get('.traffic .dygraph-graph'), trafficData, {
                color: 'hsl(18.65, 91.72%, 63.78%)',
                strokeWidth: 3,
                axisLineColor: gridColor,
                gridLineColor: gridColor,
                gridLineWidth: 1,
                highlightCircleSize: 4,
                xRangePad: 4, // must match highlightCircleSize
                labelsDiv: get('.traffic .dygraph-legend'),
                rollPeriod: 7,
                fillGraph: true,
                interactionModel: {
                    // allow user to drag finger across graph to see pageview numbers
                    'touchmove': function (event) {
                        let coords = event.touches[0];
                        let simulation = new MouseEvent('mousemove', {
                                clientX: coords.clientX,
                                clientY: coords.clientY
                            }
                        );

                        event.preventDefault();
                        event.target.dispatchEvent(simulation);
                    }
                },
                annotationMouseOverHandler: function (annotation) {
                    annotation.div.classList.remove('tooltip-hidden');
                    annotation.div.style.zIndex = '100'; // make sure tooltip appears on top of annotations
                },
                annotationMouseOutHandler: function (annotation) {
                    annotation.div.classList.add('tooltip-hidden');
                    annotation.div.style.removeProperty('z-index');
                },
                drawCallback: function (dygraph, isInitial) {
                    if (isInitial) {
                        dygraph.setAnnotations(trafficAnnotations);

                        // create custom x-axis labels (default ones are misaligned)
                        for (let i = 0; i < 12; i++) {
                            let month = new Date(2021, i).toLocaleString(locale, { month: 'short' }),
                                labelNode = document.createElement('div'),
                                shortLabel = document.createElement('span'),
                                longLabel = document.createElement('span');

                            labelNode.classList.add('x-label');
                            shortLabel.classList.add('short-month');
                            shortLabel.textContent = month.substring(0, 1);
                            longLabel.classList.add('long-month');
                            longLabel.textContent = month;

                            labelNode.appendChild(shortLabel);
                            labelNode.appendChild(longLabel);
                            get('.traffic .dygraph-x-labels').appendChild(labelNode);
                        }

                        // create custom y-axis labels (can't position default ones over top of graph)
                        let yAxisLabels = document.createElement('div');

                        yAxisLabels.classList.add('dygraph-y-labels');
                        get('.traffic .dygraph-graph').appendChild(yAxisLabels);

                        for (let i = 6; i >= 0; i--) {
                            let viewLabel = document.createElement('div');

                            viewLabel.classList.add('y-label');
                            viewLabel.textContent = i + ((i !== 0) ? 'm' : '');
                            yAxisLabels.appendChild(viewLabel);
                        }
                    }

                    trafficTooltips.forEach((tooltip, i) => {
                        // insert tooltip inside its respective annotation
                        let annotation = get(`.traffic .annotation-${i + 1}`);

                        annotation.appendChild(tooltip);
                        annotation.removeAttribute('title');
                    });
                },
                legendFormatter: function (data) {
                    let date, average, change;

                    if (data.x) {
                        date = new Date(data.xHTML).toLocaleString(locale, dateOptions);
                        average = data.series[0].yHTML.average;
                        change = data.series[0].yHTML.change;
                    }

                    return `<div class="dygraph-legend-date">${date}</div>` +
                           `<div class="dygraph-legend-views">Views: ${average}</div>` +
                           `<div class="dygraph-legend-change">7-day change: ${change}</div>`;
                },
                axes: {
                    x: {
                        drawAxis: false,
                        drawGrid: false
                    },
                    y: {
                        drawAxis: false,
                        includeZero: true,
                        valueRange: [0, 6500000],
                        valueFormatter: function (num, opts, series, graph, row, col) {
                            // original un-averaged value for this point
                            let currentValue = graph.getValue(row, col);

                            // 7-day change
                            let oneWeekAgo = graph.getValue(row - 7, col);
                            let change = Math.round((currentValue - oneWeekAgo) / oneWeekAgo * 100);

                            if (change < 0) {
                                // replace default hyphen (VERY WRONG) with actual negative symbol
                                change = '−' + change.toString().substring(1) + '%';
                            } else {
                                // plus sign for positive numbers
                                change = '+' + change + '%';
                            }

                            // 7-day change not possible for first 7 days
                            if (row < 7) change = 'N/A';

                            return {
                                actual: currentValue.toLocaleString(locale),
                                average: Math.round(num).toLocaleString(locale), // auto-averaged over rollPeriod
                                change: change
                            };
                        }
                    }
                }
            }
        );

        // create traffic annotations
        let trafficAnnotations = [
                {
                    x: "2021/01/04",
                    text: "RuneScape's 20th anniversary events begin"
                }, {
                    x: "2021/02/22",
                    text: "RuneScape: Azzanadra's Quest is released"
                }, {
                    x: "2021/05/26",
                    text: "Old School: Clans system is released"
                }, {
                    x: "2021/06/16",
                    text: "Old School: A Kingdom Divided is released"
                }, {
                    x: "2021/07/26",
                    text: "RuneScape: Nodon Front is released"
                }, {
                    x: "2021/10/06",
                    text: "Old School: Group Ironman Mode is released",
                    tickHeight: 33
                }, {
                    x: "2021/10/25",
                    text: "RuneScape: TzekHaar Front is released"
                }, {
                    x: "2021/11/25",
                    text: "Old School: Android client beta testing begins"
                }
            ],
            trafficTooltips = [];

        trafficAnnotations.forEach((annotation, i) => {
            annotation.series = 'Pageviews';
            annotation.shortText = i + 1;
            annotation.width = 24;
            annotation.height = 24;
            annotation.cssClass = `tooltip-hidden annotation-${i + 1}`;
            annotation.tickWidth = 2;
            if (annotation.tickHeight === undefined) annotation.tickHeight = 13;

            createTooltip(annotation.x, annotation.text, trafficTooltips);
        });

        // draw edits graph
        let editsGraph = new Dygraph(get('.edits .dygraph-graph'), editsData, {
                color: 'hsl(139.76, 69.67%, 47.84%)',
                strokeWidth: 3,
                axisLineColor: gridColor,
                gridLineColor: gridColor,
                gridLineWidth: 1,
                highlightCircleSize: 4,
                xRangePad: 4, // must match highlightCircleSize
                labelsDiv: get('.edits .dygraph-legend'),
                rollPeriod: 7,
                fillGraph: true,
                interactionModel: {
                    // allow user to drag finger across graph to see pageview numbers
                    'touchmove': function (event) {
                        let coords = event.touches[0];
                        let simulation = new MouseEvent('mousemove', {
                                clientX: coords.clientX,
                                clientY: coords.clientY
                            }
                        );

                        event.preventDefault();
                        event.target.dispatchEvent(simulation);
                    }
                },
                drawCallback: function (dygraph, isInitial) {
                    if (isInitial) {
                        // create custom x-axis labels (default ones are misaligned)
                        for (let i = 0; i < 12; i++) {
                            let month = new Date(2021, i).toLocaleString(locale, { month: 'short' }),
                                labelNode = document.createElement('div'),
                                shortLabel = document.createElement('span'),
                                longLabel = document.createElement('span');

                            labelNode.classList.add('x-label');
                            shortLabel.classList.add('short-month');
                            shortLabel.textContent = month.substring(0, 1);
                            longLabel.classList.add('long-month');
                            longLabel.textContent = month;

                            labelNode.appendChild(shortLabel);
                            labelNode.appendChild(longLabel);
                            get('.edits .dygraph-x-labels').appendChild(labelNode);
                        }

                        // create custom y-axis labels (can't position default ones over top of graph)
                        let yAxisLabels = document.createElement('div');

                        yAxisLabels.classList.add('dygraph-y-labels');
                        get('.edits .dygraph-graph').appendChild(yAxisLabels);

                        for (let i = 4; i >= 0; i--) {
                            let viewLabel = document.createElement('div');

                            viewLabel.classList.add('y-label');
                            viewLabel.textContent = i + ((i !== 0) ? 'k' : '');
                            yAxisLabels.appendChild(viewLabel);
                        }
                    }
                },
                legendFormatter: function (data) {
                    let date, actual, average, change;

                    if (data.x) {
                        date = new Date(data.xHTML).toLocaleString(locale, dateOptions);
                        actual = data.series[0].yHTML.actual;
                        average = data.series[0].yHTML.average;
                        change = data.series[0].yHTML.change;
                    }

                    return `<div class="dygraph-legend-date">${date}</div>` +
                           `<div class="dygraph-legend-views">Edits: ${average}</div>` +
                           `<div class="dygraph-legend-change">7-day change: ${change}</div>`;
                },
                axes: {
                    x: {
                        drawAxis: false,
                        drawGrid: false
                    },
                    y: {
                        drawAxis: false,
                        includeZero: true,
                        valueRange: [0, 4600],
                        valueFormatter: function (num, opts, series, graph, row, col) {
                            // original un-averaged value for this point
                            let currentValue = graph.getValue(row, col);

                            // 7-day change
                            let oneWeekAgo = graph.getValue(row - 7, col);
                            let change = Math.round((currentValue - oneWeekAgo) / oneWeekAgo * 100);

                            if (change < 0) {
                                // replace default hyphen (VERY WRONG) with actual negative symbol
                                change = '−' + change.toString().substring(1) + '%';
                            } else {
                                // plus sign for positive numbers
                                change = '+' + change + '%';
                            }

                            // 7-day change not possible for first 7 days
                            if (row < 7) change = 'N/A';

                            return {
                                actual: currentValue.toLocaleString(locale),
                                average: Math.round(num).toLocaleString(locale), // auto-averaged over rollPeriod
                                change: change
                            };
                        }
                    }
                }
            }
        );

        function createTooltip(date, text, tooltips) {
            let tooltip = document.createElement('div'),
                dateNode = document.createElement('div'),
                textNode = document.createElement('div');

            dateNode.classList.add('tooltip-date');
            dateNode.textContent = new Date(date).toLocaleString(locale, dateOptions);
            textNode.textContent = text;

            tooltip.classList.add('tooltip');
            tooltip.appendChild(dateNode);
            tooltip.appendChild(textNode);
            tooltips.push(tooltip);
        }
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
