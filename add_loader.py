import re

# 1. Update index.html to inject HTML right after <body>
with open('index.html', 'r') as f:
    html = f.read()

loader_html = """
    <!-- Loading Screen -->
    <div id="loader" class="loader">
        <div class="loader-word">
            <div class="loader-char"><span class="char">W</span><span class="block"></span></div>
            <div class="loader-char"><span class="char">A</span><span class="block"></span></div>
            <div class="loader-char"><span class="char">T</span><span class="block"></span></div>
            <div class="loader-char"><span class="char">C</span><span class="block"></span></div>
            <div class="loader-char"><span class="char">H</span><span class="block"></span></div>
        </div>
    </div>
"""

# Only inject if not already there
if '<div id="loader" class="loader">' not in html:
    html = html.replace('<body>', f'<body>\n{loader_html}')
    with open('index.html', 'w') as f:
        f.write(html)
        print("Injected HTML")

# 2. Add CSS to style.css
with open('style.css', 'r') as f:
    style_css = f.read()

loader_css = """
/* Loading Screen */
.loader {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: var(--bg);
    z-index: 99999;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: transform 0.8s cubic-bezier(0.77, 0, 0.175, 1);
}

.loader.finished {
    transform: translateY(-100%);
}

.loader-word {
    display: flex;
    font-family: var(--font-serif);
    font-size: 5rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: var(--text);
    text-transform: uppercase;
}

@media (min-width: 768px) {
    .loader-word { font-size: 10rem; }
}

.loader-char {
    position: relative;
    display: inline-flex;
    overflow: hidden;
    padding: 0 0.1rem;
}

.loader-char .char {
    opacity: 0;
}

.loader-char .block {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--text);
    transform: scaleX(0);
    transform-origin: left;
}

@keyframes blockIn {
    0% { transform: scaleX(0); transform-origin: left; }
    49.9% { transform: scaleX(1); transform-origin: left; }
    50% { transform: scaleX(1); transform-origin: right; }
    100% { transform: scaleX(0); transform-origin: right; }
}

@keyframes charReveal {
    0%, 49.9% { opacity: 0; }
    50%, 100% { opacity: 1; }
}

.loader:not(.finished) .loader-char .block {
    animation: blockIn 0.8s cubic-bezier(0.77, 0, 0.175, 1) forwards;
}

.loader:not(.finished) .loader-char .char {
    animation: charReveal 0.8s cubic-bezier(0.77, 0, 0.175, 1) forwards;
}

/* Stagger animation */
.loader-char:nth-child(1) .block, .loader-char:nth-child(1) .char { animation-delay: 0.2s; }
.loader-char:nth-child(2) .block, .loader-char:nth-child(2) .char { animation-delay: 0.35s; }
.loader-char:nth-child(3) .block, .loader-char:nth-child(3) .char { animation-delay: 0.5s; }
.loader-char:nth-child(4) .block, .loader-char:nth-child(4) .char { animation-delay: 0.65s; }
.loader-char:nth-child(5) .block, .loader-char:nth-child(5) .char { animation-delay: 0.8s; }
"""

if '.loader {' not in style_css:
    with open('style.css', 'a') as f:
        f.write(loader_css)
        print("Injected CSS")

# 3. Add JS to app.js
with open('app.js', 'r') as f:
    app_js = f.read()

js_code = """
    // Handle Loading Screen
    setTimeout(() => {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.add('finished');
            setTimeout(() => loader.remove(), 1000);
        }
    }, 2200);
"""

if 'loader.classList.add' not in app_js:
    # Inject it inside the init() function
    app_js = app_js.replace('function init() {', f'function init() {{\n{js_code}')
    with open('app.js', 'w') as f:
        f.write(app_js)
        print("Injected JS")
