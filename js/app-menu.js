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

    const menuOrder = [
        'agentes.html',
        'ocorrencias.html',
        'relatorio_geral.html',
        'observacoes.html',
        'gestao_usuarios.html',
        'admin.html',
        'auditoria.html',
        'estatisticas.html'
    ];

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

    function atualizarUsuarioMenu(userData, user) {
        const nome = userData?.nome || user?.email || "Usuário";
        const texto = `Olá, ${nome}`;
        const displayExistente = document.getElementById('nomeUsuarioDisplay');

        if (displayExistente) {
            const atual = String(displayExistente.textContent || "").trim();
            if (!atual || atual === "Carregando..." || atual === "...") {
                displayExistente.textContent = texto;
            }
            return;
        }

        let display = menu.querySelector('.app-user-display');
        if (!display) {
            display = document.createElement('span');
            display.className = 'app-user-display';
            const logoutButton = menu.querySelector('.app-logout-button');
            if (logoutButton) {
                menu.insertBefore(display, logoutButton);
            } else {
                menu.appendChild(display);
            }
        }

        display.textContent = texto;
    }

    function filterMenu(allowedPages) {
        const currentFile = getCurrentFile();

        menu.querySelectorAll('[data-page]').forEach((link) => {
            const page = normalize(link.getAttribute('data-page'));
            if (page === currentFile || !allowedPages.has(page)) {
                link.remove();
            }
        });

        const dropdown = menu.querySelector('.app-menu-dropdown');
        if (dropdown) {
            const orderedLinks = [...dropdown.querySelectorAll('.app-menu-link')].sort((a, b) => {
                const pageA = normalize(a.getAttribute('data-page'));
                const pageB = normalize(b.getAttribute('data-page'));
                return menuOrder.indexOf(pageA) - menuOrder.indexOf(pageB);
            });
            orderedLinks.forEach((link) => dropdown.appendChild(link));
        }

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
            const [{ initializeApp, getApp, getApps }, { getAuth, onAuthStateChanged, signOut }, { getFirestore, doc, getDoc, updateDoc, serverTimestamp }] = await Promise.all([
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
            const userData = userSnap.exists() ? userSnap.data() : null;
            const userRef = doc(db, "usuarios", user.uid);
            const marcarOnline = () => updateDoc(userRef, {
                online: true,
                ultimoAcesso: serverTimestamp()
            }).catch((error) => console.warn("Não foi possível atualizar presença:", error));
            const marcarOffline = () => updateDoc(userRef, {
                online: false,
                ultimaSaida: serverTimestamp()
            }).catch((error) => console.warn("Não foi possível encerrar presença:", error));

            marcarOnline();
            setInterval(marcarOnline, 60000);
            document.getElementById('btnSair')?.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (!confirm("Deseja realmente sair?")) return;
                await marcarOffline();
                await signOut(auth);
                window.location.href = "login.html";
            }, { capture: true });
            atualizarUsuarioMenu(userData, user);
            return getAllowedPages(userData);
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
