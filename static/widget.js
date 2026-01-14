(function() {
    'use strict';

    console.log('[Microinvest] Widget loaded');

    var API_BASE = '';

    function getApiBase() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src;
            if (src && src.indexOf('widget.js') !== -1) {
                var url = new URL(src);
                return url.origin;
            }
        }
        return window.location.origin;
    }

    API_BASE = getApiBase();
    console.log('[Microinvest] API_BASE:', API_BASE);

    window.addEventListener('message', function(event) {
        console.log('[Microinvest] Received message:', event.data);
    });

    function init() {
        console.log('[Microinvest] Init called');

        var container = document.getElementById('app');
        if (!container) {
            console.error('[Microinvest] No app container found');
            document.body.innerHTML = '<div style="padding:10px;background:#f0f0f0;">Microinvest Widget - No container</div>';
            return;
        }

        console.log('[Microinvest] Container found, rendering widget');

        container.innerHTML =
            '<div class="mi-widget">' +
                '<div class="mi-header"><span class="mi-logo">MI</span> Microinvest Credit</div>' +
                '<div class="mi-content">' +
                    '<div class="mi-info"><p>Microinvest Widget Active</p></div>' +
                    '<div class="mi-actions">' +
                        '<button class="mi-btn mi-btn-primary" id="mi-submit-btn">Отправить заявку</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.getElementById('mi-submit-btn').addEventListener('click', function() {
            alert('Button clicked! Widget is working.');
        });

        console.log('[Microinvest] Widget rendered');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
