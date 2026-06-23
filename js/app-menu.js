(() => {
    const menu = document.querySelector('.app-shortcut-menu');
    if (!menu || menu.dataset.ready === 'true') return;

    menu.dataset.ready = 'true';
    menu.style.visibility = 'hidden';

    const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const adminPages = new Set([
        'admin.html',
        'auditoria.html',
        'estatisticas.html',
        'gestao_usuarios.html',
        'relatorio_geral.html'
    ]);

    const defaultPages = new Set([
        'agentes.html',
        'ocorrencias.html',
        'observacoes.html'
    ]);

    const getCurrentFile = () => (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const normalize = (value) => String(value || '').trim().toLowerCase();

    function getAllowedPages(userData) {
        const cargo = normalize(userData?.cargo);
        const nivel = normalize(userData?.nivel_acesso);
        const isAdmin = cargo.includes('admin') || nivel === 'admin';

        if (isAdmin) {
            return new Set([...defaultPages, ...adminPages]);
        }

        if (cargo === 'ciosp' || cargo === 'cir') {
            return new Set(['ocorrencias.html']);
        }

        if (cargo === 'visualizador' || nivel === 'leitura') {
            return new Set(['agentes.html', 'ocorrencias.html']);
        }

        return new Set(defaultPages);
    }

    function filterMenu(allowedPages) {
        const currentFile = getCurrentFile();

        menu.querySelectorAll('[data-page]').forEach((link) => {
            const page = normalize(link.getAttribute('data-page'));
            if (page === currentFile || !allowedPages.has(page)) {
                link.remove();
            }
        });

        if (currentFile === 'index.html') {
            menu.querySelector('.app-home-shortcut')?.remove();
        }

        if (!menu.querySelector('.app-menu-link')) {
            menu.querySelector('.app-menu-toggle')?.remove();
            menu.querySelector('.app-menu-dropdown')?.remove();
        }

        menu.style.visibility = '';
    }

    async function loadAllowedPages() {
        try {
            const [{ initializeApp, getApp, getApps }, { getAuth, onAuthStateChanged }, { getFirestore, doc, getDoc }] = await Promise.all([
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"),
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"),
                import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js")
            ]);

            const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const db = getFirestore(app);
            const user = await new Promise((resolve) => {
                let unsubscribe = () => {};
                unsubscribe = onAuthStateChanged(auth, (currentUser) => {
                    unsubscribe();
                    resolve(currentUser);
                });
            });

            if (!user) return defaultPages;

            const userSnap = await getDoc(doc(db, "usuarios", user.uid));
            return getAllowedPages(userSnap.exists() ? userSnap.data() : null);
        } catch (error) {
            console.error("Erro ao filtrar menu:", error);
            return defaultPages;
        }
    }

    const toggle = menu.querySelector('.app-menu-toggle');

    toggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) {
            menu.classList.remove('open');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            menu.classList.remove('open');
            toggle?.setAttribute('aria-expanded', 'false');
        }
    });

    loadAllowedPages().then(filterMenu);
})();
