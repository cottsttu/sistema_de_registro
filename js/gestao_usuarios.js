async function iniciarGestaoUsuarios() {
    const {initializeApp, getApp, getApps} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, getDocs, doc, updateDoc, getDoc, serverTimestamp, onSnapshot} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    let unsubscribeUsuarios = null;

    document.getElementById('btnSair')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair?")) {
            marcarUsuarioOffline(auth.currentUser?.uid).finally(() => {
                signOut(auth).then(() => window.location.href = "login.html");
            });
        }
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // 1. VERIFICAÇÃO RIGOROSA DE ADMIN
            const docRef = doc(db, "usuarios", user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists() || docSnap.data().cargo !== 'admin') {
                alert("⛔ ACESSO NEGADO: Você não tem permissão para gerenciar usuários.");
                window.location.href = "index.html";
                return;
            }

            iniciarMonitorUsuarios();
        } else {
            window.location.href = "login.html";
        }
    });

    function iniciarMonitorUsuarios() {
        if (unsubscribeUsuarios) return;
        unsubscribeUsuarios = onSnapshot(collection(db, "usuarios"), (snapshot) => {
            carregarUsuarios(snapshot);
        }, (error) => {
            console.error("Erro ao monitorar usuários:", error);
            alert("Erro ao monitorar usuários: " + error.message);
        });
    }

    async function carregarUsuarios(snapshotUsuarios = null) {
        const tbody = document.getElementById('listaUsuarios');
        const querySnapshot = snapshotUsuarios || await getDocs(collection(db, "usuarios"));
        const usuarios = [];

        querySnapshot.forEach((docUser) => {
            const dados = docUser.data();
            const id = docUser.id;
            if (dados.cargo === 'admin') return;
            usuarios.push({ id, ...dados });
        });

        atualizarResumo(usuarios);
        tbody.innerHTML = "";

        if (!usuarios.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhum usuário encontrado.</td></tr>`;
            return;
        }

        usuarios
            .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"))
            .forEach((dados) => {
            const id = dados.id;
            const nivelAtual = dados.nivel_acesso || 'total';
            const statusAtual = obterStatusUsuario(dados) === 'ativo' ? 'ativo' : 'desativado';
            const cargo = dados.cargo || "agente";
            const nome = dados.nome || "---";
            const matricula = dados.matricula || "---";
            const avatarSrc = obterAvatarCargo(cargo);
            const conexao = obterConexaoUsuario(dados);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <span class="avatar"><img src="${avatarSrc}" alt=""></span>
                        <div>
                            <span class="user-name">${nome}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="uid-code" title="${matricula}">${matricula}</span>
                </td>
                <td><span class="cargo-pill cargo-${cargo}">${cargo.toUpperCase()}</span></td>
                <td>
                    <div class="access-control">
                        <label class="permission-toggle" title="Alternar entre edição total e apenas leitura">
                            <input type="checkbox" id="toggle_${id}" ${nivelAtual === 'total' ? 'checked' : ''} onchange="salvarPermissao('${id}')">
                            <span class="toggle-track" aria-hidden="true"><span>👁</span><span>✎</span></span>
                        </label>
                        <span id="label_${id}" class="permission-label ${nivelAtual === 'total' ? 'total' : 'leitura'}">
                            ${nivelAtual === 'total' ? '✎ Edição Total' : '👁 Apenas Leitura'}
                        </span>
                    </div>
                </td>
                <td>
                    <div class="status-control">
                        <label class="status-toggle" title="Ativar ou desativar acesso ao login">
                            <input type="checkbox" id="status_${id}" ${statusAtual === 'ativo' ? 'checked' : ''} onchange="salvarStatusUsuario('${id}')">
                            <span class="status-track" aria-hidden="true"><span>OFF</span><span>ON</span></span>
                        </label>
                        <span id="statusLabel_${id}" class="status-pill ${statusAtual}">
                            ${statusAtual === 'ativo' ? '● Ativo' : '● Desativado'}
                        </span>
                    </div>
                    <span id="msg_${id}" class="salvo">Salvo!</span>
                </td>
                <td>
                    <div class="connection-cell">
                        <span class="connection-pill ${conexao.online ? 'online' : 'offline'}">
                            ${conexao.online ? '● Online' : '● Offline'}
                        </span>
                        <span class="last-access">Último acesso: ${conexao.ultimoAcesso}</span>
                        <span class="last-access">Última saída: ${conexao.ultimaSaida}</span>
                    </div>
                </td>
                <td>
                    <div class="actions-cell">
                        <a class="btn-action" href="admin.html?uid=${encodeURIComponent(id)}" title="Abrir painel de gerenciamento completo"><span aria-hidden="true">⚙</span><span>Gerenciar</span></a>
                        <button type="button" class="btn-action secondary" onclick="mostrarDetalhesUsuario('${id}')" title="Ver dados do usuário">⋮</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function atualizarResumo(usuarios) {
        const total = usuarios.length;
        const totalPermissao = usuarios.filter((usuario) => (usuario.nivel_acesso || 'total') === 'total').length;
        const totalLeitura = total - totalPermissao;
        const cargos = usuarios.reduce((acc, usuario) => {
            const cargo = (usuario.cargo || 'agente').toUpperCase();
            acc[cargo] = (acc[cargo] || 0) + 1;
            return acc;
        }, {});

        document.getElementById('totalUsuarios').textContent = `Total: ${total}`;
        document.getElementById('distribuicaoCargos').textContent = Object.entries(cargos)
            .map(([cargo, qtd]) => `${cargo}: ${qtd}`)
            .join(' | ') || 'Sem dados';
        document.getElementById('resumoPermissoes').textContent = `Edição: ${totalPermissao} | Leitura: ${totalLeitura}`;

        const graus = total ? Math.round((totalPermissao / total) * 360) : 0;
        document.getElementById('graficoPermissoes').style.background =
            `conic-gradient(#16a34a 0deg ${graus}deg, #64748b ${graus}deg 360deg)`;
    }

    function obterAvatarCargo(cargo) {
        const cargoNormalizado = String(cargo || "agente").toLowerCase();
        const mapa = {
            agente: "src/agente_avatar.png",
            ciosp: "src/ciosp_avatar.png",
            cir: "src/cir_avatar.png",
            visualizador: "src/visualizador_avatar.png"
        };

        return mapa[cargoNormalizado] || mapa.agente;
    }

    function normalizarValor(valor) {
        return String(valor || "").trim().toLowerCase();
    }

    function obterStatusUsuario(dadosUsuario) {
        if (!dadosUsuario) return "desativado";

        const status = normalizarValor(dadosUsuario.status);
        const aprovado = normalizarValor(dadosUsuario.aprovado);

        if (dadosUsuario.ativo === true) return "ativo";
        if (status === "ativo" || status === "aprovado") return "ativo";
        if (status === "desativado") return "desativado";
        if (status === "pendente") return "pendente";
        if (dadosUsuario.aprovado === true || aprovado === "true" || aprovado === "aprovado") return "ativo";

        return "pendente";
    }

    function obterData(valor) {
        if (!valor) return null;

        let data = null;
        if (typeof valor?.toDate === "function") {
            data = valor.toDate();
        } else if (typeof valor?.seconds === "number") {
            data = new Date(valor.seconds * 1000);
        } else if (typeof valor === "number") {
            data = new Date(valor);
        } else if (typeof valor === "string") {
            data = new Date(valor);
        }

        if (!data || Number.isNaN(data.getTime())) return null;
        return data;
    }

    function formatarDataHora(valor) {
        const data = obterData(valor);
        if (!data) return "---";

        return data.toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function obterConexaoUsuario(dadosUsuario) {
        const ultimoValor = dadosUsuario?.ultimoAcesso || dadosUsuario?.lastLogin || dadosUsuario?.lastSeen;
        const saidaValor = dadosUsuario?.ultimaSaida || dadosUsuario?.lastLogout;
        const ultimoAcessoData = obterData(ultimoValor);
        const acessoRecente = ultimoAcessoData
            ? (Date.now() - ultimoAcessoData.getTime()) <= (2 * 60 * 1000)
            : false;
        const onlineMarcado = dadosUsuario?.online === true;
        const offlineMarcado = dadosUsuario?.online === false;

        return {
            online: onlineMarcado && (acessoRecente || !ultimoAcessoData) && !offlineMarcado,
            ultimoAcesso: formatarDataHora(ultimoValor),
            ultimaSaida: formatarDataHora(saidaValor)
        };
    }

    async function marcarUsuarioOffline(uid) {
        if (!uid) return;
        try {
            await updateDoc(doc(db, "usuarios", uid), {
                online: false,
                ultimaSaida: serverTimestamp()
            });
        } catch (error) {
            console.warn("Não foi possível marcar usuário offline:", error);
        }
    }

    window.salvarPermissao = async (id) => {
        const toggle = document.getElementById(`toggle_${id}`);
        const msg = document.getElementById(`msg_${id}`);
        const label = document.getElementById(`label_${id}`);
        const novoNivel = toggle?.checked ? 'total' : 'leitura';

        try {
            await updateDoc(doc(db, "usuarios", id), { nivel_acesso: novoNivel });
            if (label) {
                label.className = `permission-label ${novoNivel === 'total' ? 'total' : 'leitura'}`;
                label.textContent = novoNivel === 'total' ? '✎ Edição Total' : '👁 Apenas Leitura';
            }
            if (msg) {
                msg.style.display = "inline-flex";
                setTimeout(() => msg.style.display = "none", 2000);
            }
            carregarUsuarios();
        } catch (e) {
            if (toggle) toggle.checked = !toggle.checked;
            alert("Erro ao salvar: " + e.message);
        }
    };

    window.salvarStatusUsuario = async (id) => {
        const toggle = document.getElementById(`status_${id}`);
        const msg = document.getElementById(`msg_${id}`);
        const label = document.getElementById(`statusLabel_${id}`);
        const novoStatus = toggle?.checked ? 'ativo' : 'desativado';
        const statusBanco = novoStatus === 'ativo' ? 'aprovado' : 'desativado';

        try {
            await updateDoc(doc(db, "usuarios", id), {
                status: statusBanco,
                ativo: novoStatus === 'ativo',
                aprovado: novoStatus === 'ativo'
            });
            if (label) {
                label.className = `status-pill ${novoStatus}`;
                label.textContent = novoStatus === 'ativo' ? '● Ativo' : '● Desativado';
            }
            if (msg) {
                msg.style.display = "inline-flex";
                setTimeout(() => msg.style.display = "none", 2000);
            }
            carregarUsuarios();
        } catch (e) {
            if (toggle) toggle.checked = !toggle.checked;
            alert("Erro ao salvar status: " + e.message);
        }
    };

    window.mostrarDetalhesUsuario = async (id) => {
        try {
            const usuarioSnap = await getDoc(doc(db, "usuarios", id));
            if (!usuarioSnap.exists()) {
                alert("Usuário não encontrado.");
                return;
            }

            const dados = usuarioSnap.data();
            alert([
                `Nome: ${dados.nome || "---"}`,
                `Matrícula: ${dados.matricula || "---"}`,
                `Cargo: ${dados.cargo || "---"}`,
                `Status: ${dados.status || "---"}`
            ].join("\n"));
        } catch (error) {
            alert("Erro ao carregar dados do usuário: " + error.message);
        }
    };
}

iniciarGestaoUsuarios().catch((error) => {
    console.error("Erro ao carregar gestao_usuarios:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


