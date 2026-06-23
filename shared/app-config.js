(function () {
    const defaultApiBase = 'http://localhost:8000';
    const savedApiBase = localStorage.getItem('oferteApiBase');

    window.OFERTE_CONFIG = {
        API_BASE: window.OFERTE_API_BASE || savedApiBase || defaultApiBase,
        REQUEST_TIMEOUT_MS: 1200
    };
})();
