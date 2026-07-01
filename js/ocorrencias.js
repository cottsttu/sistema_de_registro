async function iniciarOcorrencias() {
    document.body.dataset.theme = localStorage.getItem("sttu-theme") === "night" ? "night" : "day";

    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, addDoc, query, onSnapshot, orderBy, updateDoc, doc, serverTimestamp, getDoc, arrayUnion, where, setDoc, deleteDoc, runTransaction} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

    // --- CONFIGURAÇÃO ---
    const firebaseConfig = {
        apiKey: "AIzaSyCjiEzdahcQqKS9V1Py4nAIx15Zqr9nIIo",
        authDomain: "sttu-registros.firebaseapp.com",
        projectId: "sttu-registros",
        storageBucket: "sttu-registros.firebasestorage.app",
        messagingSenderId: "785219239564",
        appId: "1:785219239564:web:4b8175a8d7ccceba06c5a9",
        measurementId: "G-C7PSE7YFRG"
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    function temPermissaoModulo(dadosUsuario, modulo, acao = "habilitado") {
        const cargo = String(dadosUsuario?.cargo || "").toLowerCase();
        const nivel = String(dadosUsuario?.nivel_acesso || "").toLowerCase();
        if (cargo === "admin" || nivel === "admin") return true;
        const permissaoModulo = dadosUsuario?.permissoes?.[modulo];
        if (!permissaoModulo || typeof permissaoModulo !== "object") return false;
        return permissaoModulo?.[acao] === true
            || permissaoModulo?.[acao] === "true"
            || (acao !== "habilitado" && permissaoModulo?.habilitado === true);
    }

    function temPermissaoAdministrativaModulo(dadosUsuario, modulo) {
        return ["editar", "excluir"].some((acao) => temPermissaoModulo(dadosUsuario, modulo, acao));
    }

    async function marcarOffline(uid = auth.currentUser?.uid) {
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

    let veiculosOcupados = new Set();
    let nomeUsuarioLogado = "ANÔNIMO"; 
    let usuarioEhAdmin = false; 
    let isVisualizador = false;
    
    // Lista unificada
    let listaGlobalOcorrencias = [];

    async function carregarImagemPdf(caminho) {
        if (window.STTU_EMBLEMA_DATA_URL) return window.STTU_EMBLEMA_DATA_URL;
        const url = new URL(caminho, window.location.href).href;
        return await new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error("Tempo excedido ao carregar emblema.")), 1500);
            try {
                const resposta = await fetch(url, { cache: "reload" });
                if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
                const blob = await resposta.blob();
                const reader = new FileReader();
                reader.onload = () => {
                    clearTimeout(timeoutId);
                    resolve(reader.result);
                };
                reader.onerror = () => {
                    clearTimeout(timeoutId);
                    reject(reader.error || new Error("Falha ao ler emblema."));
                };
                reader.readAsDataURL(blob);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    async function adicionarEmblemaPdf(doc, x = 14, y = 4, largura = 18, altura = 18) {
        try {
            const emblema = await carregarImagemPdf("src/emblemasttu_relatorios.png");
            doc.addImage(emblema, "PNG", x, y, largura, altura);
        } catch (error) {
            console.error("Erro ao inserir o emblema no PDF:", error);
        }
    }

    // --- SEGURANÇA + TIMER DE 15 MIN ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    
                    nomeUsuarioLogado = dados.nome || "Usuário";
                    usuarioEhAdmin = temPermissaoAdministrativaModulo(dados, "ocorrencias"); 
                    
                    // Se já tiver dados carregados, renderiza novamente com as permissões corretas
                    if(listaGlobalOcorrencias.length > 0) {
                        renderizarTabelas(); 
                    }
                    
                    document.getElementById('nomeUsuarioDisplay').innerText = "Olá, " + nomeUsuarioLogado + (usuarioEhAdmin ? " (ADMIN)" : "");

                    if (!temPermissaoModulo(dados, "relatorios")) {
                        const btnCsv = document.getElementById('btnDownloadCSV');
                        if (btnCsv) btnCsv.style.display = 'none';

                        const btnRel = document.getElementById('btnNavRelatorios');
                        if (btnRel) btnRel.style.display = 'none';
                    }

                    if (dados.cargo === 'visualizador' || dados.nivel_acesso === 'leitura') {
                        isVisualizador = true;
                        
                        const areaRegistro = document.getElementById('areaRegistro');
                        if (areaRegistro) areaRegistro.remove();
                        const modalEncaminhar = document.getElementById('modalEncaminhar');
                        if (modalEncaminhar) modalEncaminhar.remove();

                        const styleBlock = document.createElement('style');
                        styleBlock.innerHTML = `
                            .col-acao, .btn-acao-tabela, .btn-encaminhar, .btn-concluir { display: none !important; }
                            table th:last-child, table td:last-child { display: none !important; }
                        `;
                        document.head.appendChild(styleBlock);

                        const btnObs = document.getElementById('btnNavObservacoes');
                        if (btnObs) btnObs.style.display = 'none';
                        
                        window.abrirModalEncaminhar = () => alert("Acesso Negado.");
                        window.concluirOcorrencia = () => alert("Acesso Negado.");
                        window.confirmarEncaminhamento = () => alert("Acesso Negado.");
                    } else {
                        isVisualizador = false;
                    }

                    if (dados.cargo === 'ciosp') {
                        const btnCsv = document.getElementById('btnDownloadCSV');
                        if(btnCsv) btnCsv.style.display = 'none';
                        const linkAgentes = document.getElementById('btnNavAgentes');
                        if(linkAgentes) linkAgentes.style.display = 'none';
                        const linkObservacoes = document.getElementById('btnNavObservacoes');
                        if(linkObservacoes) linkObservacoes.style.display = 'none';
                         const linkRel = document.getElementById('btnNavRelatorios');
                        if(linkRel) linkRel.style.display = 'none';
                    }
                    
                      if (dados.cargo === 'cir') {
                        const btnCsv = document.getElementById('btnDownloadCSV');
                        if(btnCsv) btnCsv.style.display = 'none';
                        const linkAgentes = document.getElementById('btnNavAgentes');
                        if(linkAgentes) linkAgentes.style.display = 'none';
                        const linkObservacoes = document.getElementById('btnNavObservacoes');
                        if(linkObservacoes) linkObservacoes.style.display = 'none';
                         const linkRel = document.getElementById('btnNavRelatorios');
                        if(linkRel) linkRel.style.display = 'none';
                    }

                    if (dados.cargo === 'agente' && !usuarioEhAdmin) {
                        const btnCsv = document.getElementById('btnDownloadCSV');
                        if(btnCsv) btnCsv.style.display = 'none';
                        const btnRel = document.getElementById('btnNavRelatorios');
                        if(btnRel) btnRel.style.display = 'none';
                    }

                    if (dados.cargo !== 'visualizador') {
                        let tempoInatividade;
                        const LIMITE_TEMPO = 15 * 60 * 1000; 
                        const resetarTimer = () => {
                            clearTimeout(tempoInatividade);
                            tempoInatividade = setTimeout(() => {
                                alert("⚠️ Sessão encerrada por inatividade (15min).");
                                marcarOffline(user.uid).finally(() => {
                                    signOut(auth).then(() => window.location.href = "login.html");
                                });
                            }, LIMITE_TEMPO);
                        };
                        window.onload = resetarTimer; document.onmousemove = resetarTimer; document.onkeypress = resetarTimer; document.onclick = resetarTimer; document.onscroll = resetarTimer;
                    }
                } else {
                    alert("Erro de cadastro."); await signOut(auth); window.location.href = "login.html";
                }
            } catch (error) { console.error("Erro:", error); }
        } else {
            window.location.href = "login.html";
        }
    });

    const btnSair = document.getElementById('btnSair');
    if(btnSair) {
        btnSair.onclick = () => marcarOffline().finally(() => signOut(auth).then(() => window.location.href = "login.html"));
    }

    const menuToggle = document.getElementById('menuToggle');
    const shortcutMenu = document.querySelector('.shortcut-menu');
    if (menuToggle && shortcutMenu) {
        menuToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const aberto = shortcutMenu.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        });

        document.addEventListener('click', (event) => {
            if (!shortcutMenu.contains(event.target)) {
                shortcutMenu.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                shortcutMenu.classList.remove('open');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    let equipesSelecionadas = [];
    let equipesModal = [];

    function getHoraAtual() {
        const agora = new Date();
        return String(agora.getHours()).padStart(2, '0') + ":" + String(agora.getMinutes()).padStart(2, '0') + ":" + String(agora.getSeconds()).padStart(2, '0');
    }

    function preencherHoraAtualAoClicar(event) {
        const input = event.currentTarget;
        if (!input.value) input.value = getHoraAtual();
    }

    function formatarHoraCompleta(valor) {
        const numeros = valor.replace(/\D/g, '').slice(0, 6);
        if (numeros.length <= 2) return numeros;
        if (numeros.length <= 4) return `${numeros.slice(0, 2)}:${numeros.slice(2)}`;
        return `${numeros.slice(0, 2)}:${numeros.slice(2, 4)}:${numeros.slice(4)}`;
    }

    function formatarHoraComSegundos(valor) {
        const texto = String(valor || "").trim();
        if (/^\d{2}:\d{2}:\d{2}$/.test(texto)) return texto;
        if (/^\d{2}:\d{2}$/.test(texto)) return `${texto}:00`;
        return texto;
    }

    function segundosDoHorario(valor) {
        const partes = String(valor || "").match(/\d{1,2}/g) || [];
        const h = Number(partes[0] || 0);
        const m = Number(partes[1] || 0);
        const s = Number(partes[2] || 0);
        return (h * 3600) + (m * 60) + s;
    }

    function formatarHorasNoTexto(valor) {
        return String(valor || "").replace(/\b(\d{2}:\d{2})(?!:\d{2})\b/g, "$1:00");
    }

    function obterClasseRegiao(zona) {
        if (!zona) return '';
        const z = zona.toUpperCase();
        if (z === 'REGIÃO 1') return 'regiao-1';
        if (z === 'REGIÃO 2') return 'regiao-2';
        if (z === 'REGIÃO 3') return 'regiao-3';
        if (z === 'REGIÃO 4') return 'regiao-4';
        if (z === 'REGIÃO 5') return 'regiao-5';
        return '';
    }

    function formatarTelefone(valor) {
        const numeros = valor.replace(/\D/g, '').slice(0, 11);
        const ddd = numeros.slice(0, 2);
        const prefixo = numeros.slice(2, 7);
        const sufixo = numeros.slice(7, 11);

        if (numeros.length <= 2) return ddd ? `(${ddd}` : '';
        if (numeros.length <= 7) return `(${ddd}) ${prefixo}`;
        return `(${ddd}) ${prefixo}-${sufixo}`;
    }

    ['solicitante', 'editSolicitante', 'sobrenome', 'editSobrenome', 'contato', 'editContato'].forEach(id => {
        const input = document.getElementById(id);
        if(input) input.addEventListener('input', function() {
            if(id.includes('solicitante') || id.includes('sobrenome')) this.value = this.value.replace(/[0-9]/g, '');
            if(id.includes('contato')) this.value = formatarTelefone(this.value);
        });
    });

    ['horaEnvio', 'horaFinal'].forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('click', preencherHoraAtualAoClicar);
        input.addEventListener('focus', preencherHoraAtualAoClicar);
        input.addEventListener('input', function() {
            this.value = formatarHoraCompleta(this.value);
        });
    });

    document.querySelectorAll('[data-clear-time]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const input = document.getElementById(button.dataset.clearTime);
            if (input) input.value = "";
        });
    });

    document.querySelectorAll('[data-clear-textarea]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const campo = document.getElementById(button.dataset.clearTextarea);
            if (campo) campo.value = "";
        });
    });

    document.getElementById('btnLimparOcorrencia')?.addEventListener('click', () => {
        document.getElementById('registroForm')?.reset();
        equipesSelecionadas = [];
        renderizarEquipes('containerEquipes', equipesSelecionadas, (r) => {
            equipesSelecionadas = equipesSelecionadas.filter(i => i !== r);
            renderizarEquipes('containerEquipes', equipesSelecionadas, () => {});
        });
        const qtcContainer = document.getElementById('qtcContainer');
        const subtipoContainer = document.getElementById('subtipoContainer');
        if (qtcContainer) qtcContainer.style.display = 'none';
        if (subtipoContainer) subtipoContainer.style.display = 'none';
    });

    window.verificarRegrasObrigatoriedade = function() {
        if (isVisualizador) return;
        const ocorrencia = document.getElementById('ocorrencia').value;
        const situacao = document.getElementById('situacao').value;
        const inputHoraEnvio = document.getElementById('horaEnvio');
        const equipeSelect = document.getElementById('equipeSelect');
        const qtcContainer = document.getElementById('qtcContainer');
        const divSub = document.getElementById('subtipoContainer');
        const selSub = document.getElementById('subtipoSelect');

        selSub.innerHTML = ""; 
        if (ocorrencia === "INTERVENÇÃO VIÁRIA") {
            divSub.style.display = "block";
            ["CORRIDA", "PROCISSÃO", "EVENTO"].forEach(op => selSub.add(new Option(op, op)));
        } else if (ocorrencia === "INTERVENÇÃO EM VIA") {
            divSub.style.display = "block";
            ["ALAGAMENTO", "OBRAS", "CRATERAS", "TOMBAMENTO"].forEach(op => selSub.add(new Option(op, op)));
        } else {
            divSub.style.display = "none";
        }

        const isExcecao = (ocorrencia === "VEÍCULO ABANDONADO" || situacao === "NÃO ATENDIDA" || situacao === "PARA O DESPACHO" ||  situacao === "CONCLUÍDA" || situacao === "PARA O PRÓXIMO TURNO");

        if (isExcecao) {
            inputHoraEnvio.required = false;
            inputHoraEnvio.classList.remove('campo-obrigatorio'); inputHoraEnvio.classList.add('campo-opcional');
            equipeSelect.classList.remove('campo-obrigatorio'); equipeSelect.classList.add('campo-opcional');
        } else {
            inputHoraEnvio.required = true;
            inputHoraEnvio.classList.add('campo-obrigatorio'); inputHoraEnvio.classList.remove('campo-opcional');
            equipeSelect.classList.add('campo-obrigatorio'); equipeSelect.classList.remove('campo-opcional');
        }
        qtcContainer.style.display = (situacao === 'NÃO ATENDIDA') ? 'block' : 'none';
    };

    function popularEquipes(selectId, equipesDaOcorrenciaAtual = []) {
        const sel = document.getElementById(selectId);
        if (!sel) return;
        sel.innerHTML = '<option value="">+ ADICIONAR...</option>';
        
        const adicionarOpcao = (valor) => {
            const opt = new Option(valor, valor);
            if (veiculosOcupados.has(valor) && !equipesDaOcorrenciaAtual.includes(valor)) {
                opt.text += " (EM USO)";
            }
            sel.add(opt);
        };

        for(let i=1; i<=80; i++) { let n = i < 10 ? '0'+i : i; adicionarOpcao('MT '+n); }
        for(let i=1; i<=20; i++) { let n = i < 10 ? '0'+i : i; adicionarOpcao('VT '+n); }
        ["EQUIPE SEMAFÓRICA", "SINAL VIDA", "UMT", "SERTELL", "VÍDEO MONITORAMENTO"].forEach(nome => adicionarOpcao(nome));
    }

    function renderizarEquipes(targetContainer, lista, removeCallback) {
        const container = document.getElementById(targetContainer);
        if (!container) return;
        container.innerHTML = "";
        lista.forEach(eq => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.innerHTML = `${eq} <span>&times;</span>`;
            chip.onclick = () => removeCallback(eq);
            container.appendChild(chip);
        });
    }

    const elEquipeSelect = document.getElementById('equipeSelect');
    if (elEquipeSelect) {
        elEquipeSelect.onchange = (e) => {
            const val = e.target.value;
            if (veiculosOcupados.has(val)) {
                if(!confirm(`⚠️ ATENÇÃO:\n\nA equipe ${val} já está em atendimento em outra ocorrência.\n\nDeseja mesmo enviá-la para este local?`)) {
                    e.target.value = ""; return;
                }
            }
            if (val && !equipesSelecionadas.includes(val)) {
                equipesSelecionadas.push(val);
                renderizarEquipes('containerEquipes', equipesSelecionadas, (r) => {
                    equipesSelecionadas = equipesSelecionadas.filter(i => i !== r);
                    renderizarEquipes('containerEquipes', equipesSelecionadas, (r) => equipesSelecionadas = equipesSelecionadas.filter(i => i !== r));
                });
            }
            e.target.value = "";
        };
    }

    const elEditEquipeSelect = document.getElementById('editEquipeSelect');
    if (elEditEquipeSelect) {
        elEditEquipeSelect.onchange = (e) => {
            const val = e.target.value;
            if (veiculosOcupados.has(val) && !equipesModal.includes(val)) {
                 if(!confirm(`⚠️ ATENÇÃO:\n\nA equipe ${val} já está em atendimento em outra ocorrência.\n\nDeseja mesmo enviá-la para este local?`)) {
                    e.target.value = ""; return;
                }
            }
            if (val && !equipesModal.includes(val)) {
                equipesModal.push(val);
                renderizarEquipes('editContainerEquipes', equipesModal, (r) => {
                    equipesModal = equipesModal.filter(i => i !== r);
                    renderizarEquipes('editContainerEquipes', equipesModal, (r) => equipesModal = equipesModal.filter(i => i !== r));
                });
            }
            e.target.value = "";
        };
    }

    function getDataHojeISO() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    const dataFiltro = getDataHojeISO();

    // --- NOVA LÓGICA DE BUSCA DUPLA (Hoje + Pendentes Antigas) ---
    let docsHoje = [];
    let docsPendentes = [];

    function atualizarListaUnificada() {
        const mapaUnico = new Map();

        docsPendentes.forEach(d => mapaUnico.set(d.id, d));
        docsHoje.forEach(d => mapaUnico.set(d.id, d));

        listaGlobalOcorrencias = Array.from(mapaUnico.values());

        listaGlobalOcorrencias.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.seconds : 0;
            const tB = b.timestamp ? b.timestamp.seconds : 0;
            return tB - tA; 
        });

        renderizarTabelas();
    }

    const qHoje = query(
        collection(db, "ocorrencias_sttu"), 
        where("data_filtro", "==", dataFiltro)
    );

    const qPendentes = query(
        collection(db, "ocorrencias_sttu"), 
        where("situacao", "in", ["EM ANDAMENTO", "ENCAMINHADA", "NÃO ATENDIDA", "PARA O DESPACHO", "PARA O PRÓXIMO TURNO"])
    );

    onSnapshot(qHoje, (snapshot) => {
        docsHoje = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListaUnificada();
    });

    onSnapshot(qPendentes, (snapshot) => {
        docsPendentes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        atualizarListaUnificada();
    });

    function escaparHtml(valor) {
        return String(valor || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function resolverSituacaoPorEquipe(situacao, equipes) {
        const situacaoAtual = situacao || "PARA O DESPACHO";
        const temEquipe = Array.isArray(equipes)
            ? equipes.some((equipe) => String(equipe || "").trim())
            : Boolean(String(equipes || "").trim());

        if (["EM ANDAMENTO", "CONCLUÍDA", "NÃO ATENDIDA", "PARA O PRÓXIMO TURNO"].includes(situacaoAtual)) {
            return situacaoAtual;
        }

        return temEquipe ? "ENCAMINHADA" : "PARA O DESPACHO";
    }

    function criarBotaoVisualizar(dados) {
        const btnView = document.createElement('button');
        btnView.type = 'button';
        btnView.className = 'btn-view';
        btnView.innerHTML = '&#128269;';
        btnView.title = 'Visualizar registro completo';
        btnView.setAttribute('aria-label', 'Visualizar registro completo');
        btnView.onclick = () => window.abrirModalVisualizacao(dados);
        return btnView;
    }

    window.abrirModalVisualizacao = (dados) => {
        const modal = document.getElementById('modalVisualizarRegistro');
        const conteudo = document.getElementById('conteudoRegistroCompleto');
        if (!modal || !conteudo) return;

        const nomeExibicao = dados.sobrenome ? `${dados.solicitante || ""} ${dados.sobrenome}` : (dados.solicitante || "-");
        const historico = Array.isArray(dados.historicoLogs) && dados.historicoLogs.length
            ? dados.historicoLogs.join('\n')
            : "-";

        const campos = [
            ["Nº Registro", dados.numRegistro],
            ["Solicitante", nomeExibicao],
            ["Contato", dados.contato],
            ["Ocorrência", dados.ocorrencia],
            ["Região", dados.zona],
            ["Equipe(s)", dados.equipe],
            ["Hora Envio", formatarHoraComSegundos(dados.horaEnvio)],
            ["Situação", dados.situacao],
            ["Hora Final", formatarHoraComSegundos(dados.horaFinal) || "-"],
            ["Data", dados.data_filtro ? dados.data_filtro.split('-').reverse().join('/') : "-"],
            ["Local", dados.local, true],
            ["Detalhe", dados.detalhamento, true],
            ["Resultado Final", dados.resultadoFinal || "-", true],
            ["Histórico", historico, true]
        ];

        conteudo.innerHTML = "";
        campos.forEach(([label, valor, full]) => {
            const item = document.createElement('div');
            item.className = full ? 'registro-campo full' : 'registro-campo';

            const titulo = document.createElement('strong');
            titulo.textContent = label;

            const texto = document.createElement('span');
            texto.textContent = valor || "-";

            item.appendChild(titulo);
            item.appendChild(texto);
            conteudo.appendChild(item);
        });

        modal.style.display = 'flex';
    };

    window.fecharModalVisualizacao = () => {
        const modal = document.getElementById('modalVisualizarRegistro');
        if (modal) modal.style.display = 'none';
    };

    function renderizarTabelas() {
        const tPendentes = document.getElementById('tabelaPendentes').getElementsByTagName('tbody')[0];
        const tConcluidas = document.getElementById('relatorioTable').getElementsByTagName('tbody')[0];
        tPendentes.innerHTML = ""; tConcluidas.innerHTML = "";
        veiculosOcupados.clear(); 

        const normalizarSituacaoOrdenacao = (situacao) => String(situacao || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toUpperCase();

        const ocorrenciaFinalizada = (ocorrencia) => {
            const situacao = normalizarSituacaoOrdenacao(ocorrencia.situacao);
            return situacao === 'CONCLUIDA' || situacao === 'NAO ATENDIDA';
        };

        const prioridadePendente = (situacaoOriginal) => {
            const situacao = normalizarSituacaoOrdenacao(situacaoOriginal);
            if (situacao === 'PARA O DESPACHO' || situacao === 'PARA DESPACHO') return 0;
            if (situacao === 'EM ANDAMENTO' || situacao === 'ENCAMINHADA') return 1;
            return 2;
        };

        const listaPendentesOrdenada = listaGlobalOcorrencias
            .filter((ocorrencia) => !ocorrenciaFinalizada(ocorrencia))
            .sort((a, b) => {
                const prioridadeA = prioridadePendente(a.situacao);
                const prioridadeB = prioridadePendente(b.situacao);
                if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

                const horaA = segundosDoHorario(a.horaEnvio);
                const horaB = segundosDoHorario(b.horaEnvio);
                if (horaA !== horaB) return horaB - horaA;

                const tA = a.timestamp ? a.timestamp.seconds : 0;
                const tB = b.timestamp ? b.timestamp.seconds : 0;
                return tB - tA;
            });

        const listaRender = [
            ...listaPendentesOrdenada,
            ...listaGlobalOcorrencias.filter((ocorrencia) => ocorrenciaFinalizada(ocorrencia))
        ];

        listaRender.forEach((d) => {
            const id = d.id;
            const statusFinalizado = ocorrenciaFinalizada(d);

            if (statusFinalizado && d.data_filtro !== dataFiltro) {
                return;
            }
            
            if ((d.situacao === 'EM ANDAMENTO' || d.situacao === 'ENCAMINHADA') && d.equipe) {
                const vtrs = d.equipe.split(', '); 
                vtrs.forEach(v => veiculosOcupados.add(v.trim()));
            }

            const row = statusFinalizado ? tConcluidas.insertRow() : tPendentes.insertRow();
            
            // Junta o nome e sobrenome na tabela (para exibição)
            const nomeExibicao = d.sobrenome ? `${d.solicitante} ${d.sobrenome}` : (d.solicitante || "");

            const campos = [d.numRegistro, nomeExibicao, d.contato, d.ocorrencia, d.local, d.detalhamento, d.zona, d.equipe, formatarHoraComSegundos(d.horaEnvio), d.situacao, formatarHoraComSegundos(d.horaFinal), d.resultadoFinal];
            
            campos.forEach((txt, idx) => {
                const cell = row.insertCell();
                let conteudo = escaparHtml(txt).replace(/\n/g, '<br>');
                if (idx === 6) cell.className = obterClasseRegiao(txt);
                
                if(idx === 9) { 
                    if (txt === 'CONCLUÍDA') cell.className = 'status-concluida';
                    else if (txt === 'EM ANDAMENTO' || txt === 'ENCAMINHADA') cell.className = 'status-encaminhada';
                    else if (txt === 'PARA O DESPACHO') cell.className = 'status-despacho'; 
                    else cell.className = 'status-pendente';
                }
                cell.title = String(txt || "");
                const preview = document.createElement('span');
                preview.className = 'cell-preview';
                preview.innerHTML = conteudo || "-";
                cell.appendChild(preview);
            });

            const cellHist = row.insertCell();
            cellHist.className = 'col-hist';
            
            const divWrapper = document.createElement('div');
            divWrapper.className = 'hist-wrapper';
            const lista = document.createElement('ul');
            lista.className = 'lista-historico';

            const logsParaExibir = d.historicoLogs ? [...d.historicoLogs] : [];
            logsParaExibir.reverse(); 
            
            logsParaExibir.forEach(log => {
                const item = document.createElement('li');
                if (log.includes(" por ")) {
                    const partes = log.split(" por ");
                    const primeiraParte = formatarHorasNoTexto(partes[0]);
                    let resto = partes.slice(1).join(" por "); 
                    
                    if (usuarioEhAdmin) {
                        let nome = resto;
                        let detalhes = "";
                        if (resto.includes(" | ")) {
                            nome = resto.substring(0, resto.indexOf(" | "));
                            detalhes = resto.substring(resto.indexOf(" | ")); 
                        }
                        item.innerHTML = `<span class="hist-meta">${primeiraParte}</span> <span class="hist-autor">por ${nome}</span><span class="hist-detalhe">${detalhes.replace('|', '')}</span>`;
                    } else {
                        let detalhes = "";
                        if (resto.includes(" | ")) {
                            detalhes = resto.substring(resto.indexOf("|")); 
                        }
                        item.innerHTML = `<span class="hist-meta">${primeiraParte}</span> <span class="hist-detalhe">${detalhes.replace('|', '')}</span>`;
                    }
                } else {
                    item.innerText = formatarHorasNoTexto(log);
                }
                lista.appendChild(item);
            });
            divWrapper.appendChild(lista);
            cellHist.appendChild(divWrapper);

            // --- AÇÕES PARA TABELA DE PENDENTES ---
            if (!isVisualizador && !statusFinalizado) {
                const acCell = row.insertCell();
                acCell.className = 'col-acao';
                acCell.style.display = 'flex';
                acCell.style.flexDirection = 'column';
                acCell.style.gap = '4px';
                acCell.style.alignItems = 'center';
                acCell.style.justifyContent = 'center';
                acCell.style.textAlign = 'center';

                const btnEnc = document.createElement('button');
                btnEnc.className = 'btn btn-encaminhar btn-acao-tabela'; 
                btnEnc.innerText = 'ENCAMINHAR';
                btnEnc.onclick = () => window.abrirModalEncaminhar(id, d);
                acCell.appendChild(btnEnc);

                const btnCon = document.createElement('button');
                btnCon.className = 'btn btn-concluir btn-acao-tabela'; 
                btnCon.innerText = 'CONCLUIR';
                btnCon.onclick = () => window.concluirOcorrencia(id, d);
                acCell.appendChild(btnCon);

                const btnPdf = document.createElement('button');
                btnPdf.className = 'btn btn-acao-tabela';
                btnPdf.style.backgroundColor = '#c0392b';
                btnPdf.style.color = 'white';
                btnPdf.innerText = '📄 PDF';
                btnPdf.onclick = () => window.gerarPdfOcorrencia(d);
                acCell.appendChild(btnPdf);

                acCell.appendChild(criarBotaoVisualizar(d));
            }

            // --- AÇÕES PARA TABELA DE CONCLUÍDAS ---
            if (statusFinalizado) {
                const cellDel = row.insertCell();
                cellDel.style.textAlign = "center";
                cellDel.style.display = "flex";
                cellDel.style.flexDirection = "column";
                cellDel.style.gap = "4px";
                cellDel.style.alignItems = "center";
                cellDel.style.justifyContent = "center";
                
                const btnPdf = document.createElement('button');
                btnPdf.className = 'btn btn-acao-tabela';
                btnPdf.style.backgroundColor = '#c0392b';
                btnPdf.style.color = 'white';
                btnPdf.style.fontSize = '10px';
                btnPdf.innerText = '📄 PDF';
                btnPdf.onclick = () => window.gerarPdfOcorrencia(d);
                cellDel.appendChild(btnPdf);

                if (usuarioEhAdmin) {
                    const btnEditar = document.createElement('button');
                    btnEditar.className = 'btn btn-editar-ocorrencia btn-acao-tabela';
                    btnEditar.innerText = 'EDITAR';
                    btnEditar.onclick = () => window.abrirModalEditarOcorrencia(id, d);
                    cellDel.appendChild(btnEditar);

                    const btnDel = document.createElement('button');
                    btnDel.className = 'btn-trash';
                    btnDel.innerHTML = '✕';
                    btnDel.title = "Excluir Registro Permanentemente";
                    btnDel.onclick = () => window.excluirOcorrencia(id, d.numRegistro);
                    cellDel.appendChild(btnDel);
                }

                cellDel.appendChild(criarBotaoVisualizar(d));
            }
        });
        popularEquipes('equipeSelect');
    }

    // --- NOVA FUNÇÃO DE GERAR PDF ---
    window.gerarPdfOcorrencia = async (o) => {
        if (!o) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        await adicionarEmblemaPdf(doc);
        
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE OCORRÊNCIA INDIVIDUAL", 105, 20, { align: "center" });
        
        doc.setDrawColor(200);
        doc.line(14, 25, 196, 25);
        doc.setFontSize(11);
        
        let startY = 35;
        const addLinha = (label, valor, link = null) => {
            doc.setFont("helvetica", "bold");
            doc.text(`${label}:`, 14, startY);
            
            doc.setFont("helvetica", "normal");
            const textoFormatado = valor ? String(valor) : "-";
            const linhasDeTexto = doc.splitTextToSize(textoFormatado, 140);
            
            if (link && valor && valor.trim() !== "") {
                doc.setTextColor(41, 128, 185); 
                doc.text(linhasDeTexto, 45, startY);
                doc.link(45, startY - 4, 140, linhasDeTexto.length * 6, { url: link });
                doc.setTextColor(0, 0, 0); 
            } else {
                doc.text(linhasDeTexto, 45, startY);
            }
            
            startY += (linhasDeTexto.length * 6) + 2;
        };

        addLinha("Nº Registro", o.numRegistro);
        addLinha("Ocorrência", o.ocorrencia);
        
        let urlMaps = null;
        if (o.local) {
            const enderecoBusca = encodeURIComponent(o.local + ", Natal - RN");
            urlMaps = `https://www.google.com/maps/search/?api=1&query=${enderecoBusca}`;
        }
        addLinha("Local", o.local, urlMaps);
        
        addLinha("Detalhes", o.detalhamento);
        addLinha("Região/Zona", o.zona);
        addLinha("Equipe/VTR", o.equipe);
        addLinha("Situação", o.situacao);
        addLinha("Data", o.data_filtro ? o.data_filtro.split('-').reverse().join('/') : "-");
        addLinha("Hora Início", formatarHoraComSegundos(o.horaEnvio));
        addLinha("Hora Final", formatarHoraComSegundos(o.horaFinal));
        addLinha("Resultado", o.resultadoFinal);

        startY += 5;
        if (startY > 270) { doc.addPage(); startY = 20; }
        doc.line(14, startY - 5, 196, startY - 5);
        doc.setFont("helvetica", "bold");
        doc.text("HISTÓRICO DE ATUALIZAÇÕES:", 14, startY);
        startY += 7;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        
        let hist = "";
        if (o.historicoLogs && Array.isArray(o.historicoLogs)) {
            hist = o.historicoLogs.join("\n");
        } else {
            hist = "Nenhum histórico registrado.";
        }
        
        const histLines = doc.splitTextToSize(hist, 182);
        
        if (startY + (histLines.length * 4) > 280) { 
            doc.addPage(); 
            startY = 20; 
        }
        doc.text(histLines, 14, startY);

        doc.save(`Ocorrencia_${o.numRegistro || 'Avulsa'}.pdf`);
    };

    window.abrirModalEncaminhar = (id, dados) => {
        if (isVisualizador) return;
        document.getElementById('editId').value = id;
        document.getElementById('editSolicitante').value = dados.solicitante || "";
        document.getElementById('editSobrenome').value = dados.sobrenome || "";
        document.getElementById('editContato').value = dados.contato;
        document.getElementById('editOcorrencia').value = dados.ocorrencia.split(" (")[0]; 
        document.getElementById('editLocal').value = dados.local;
        document.getElementById('editDetalhamento').value = dados.detalhamento;
        document.getElementById('editZona').value = dados.zona;
        document.getElementById('editSituacao').value = 'ENCAMINHADA';
        equipesModal = dados.equipe ? dados.equipe.split(", ") : [];
        popularEquipes('editEquipeSelect', equipesModal);
        renderizarEquipes('editContainerEquipes', equipesModal, (r) => {
            equipesModal = equipesModal.filter(i => i !== r);
            renderizarEquipes('editContainerEquipes', equipesModal, (r) => equipesModal = equipesModal.filter(i => i !== r));
        });
        document.getElementById('modalEncaminhar').style.display = 'flex';
    };

    window.abrirModalEditarOcorrencia = (id, dados) => {
        if (!usuarioEhAdmin) {
            alert("⛔ Acesso Negado: Apenas administradores podem editar ocorrências concluídas.");
            return;
        }

        document.getElementById('editId').value = id;
        document.getElementById('editSolicitante').value = dados.solicitante || "";
        document.getElementById('editSobrenome').value = dados.sobrenome || "";
        document.getElementById('editContato').value = dados.contato || "";
        document.getElementById('editOcorrencia').value = (dados.ocorrencia || "").split(" (")[0];
        document.getElementById('editLocal').value = dados.local || "";
        document.getElementById('editDetalhamento').value = dados.detalhamento || "";
        document.getElementById('editZona').value = dados.zona || "";
        document.getElementById('editSituacao').value = dados.situacao || "CONCLUÍDA";
        equipesModal = dados.equipe ? dados.equipe.split(", ").filter(Boolean) : [];
        popularEquipes('editEquipeSelect', equipesModal);
        renderizarEquipes('editContainerEquipes', equipesModal, (r) => {
            equipesModal = equipesModal.filter(i => i !== r);
            renderizarEquipes('editContainerEquipes', equipesModal, (r) => equipesModal = equipesModal.filter(i => i !== r));
        });
        document.getElementById('modalEncaminhar').style.display = 'flex';
    };

    window.fecharModal = () => document.getElementById('modalEncaminhar').style.display = 'none';

    window.confirmarEncaminhamento = async () => {
        if (isVisualizador) return;
        const id = document.getElementById('editId').value;
        const novaHora = getHoraAtual();
        const docRef = doc(db, "ocorrencias_sttu", id);
        const docSnap = await getDoc(docRef);
        const antigos = docSnap.data();

        const novos = {
            solicitante: document.getElementById('editSolicitante').value.toUpperCase().trim(),
            sobrenome: document.getElementById('editSobrenome').value.toUpperCase().trim(),
            contato: document.getElementById('editContato').value.toUpperCase().trim(),
            ocorrencia: document.getElementById('editOcorrencia').value,
            local: document.getElementById('editLocal').value.toUpperCase().trim(),
            detalhamento: document.getElementById('editDetalhamento').value.toUpperCase().trim(),
            zona: document.getElementById('editZona').value,
            equipe: equipesModal.join(", "),
            situacao: resolverSituacaoPorEquipe(document.getElementById('editSituacao').value, equipesModal)
        };

        let mudancas = [];
        if (antigos.equipe !== novos.equipe) mudancas.push(`Equipe: ${antigos.equipe || 'SEM EQUIPE'} ➔ ${novos.equipe}`);
        if (antigos.zona !== novos.zona) mudancas.push(`Zona: ${antigos.zona} ➔ ${novos.zona}`);
        if (antigos.local !== novos.local) mudancas.push(`Local alterado`);
        if (antigos.ocorrencia !== novos.ocorrencia) mudancas.push(`Tipo: ${antigos.ocorrencia} ➔ ${novos.ocorrencia}`);
        if (antigos.detalhamento !== novos.detalhamento) mudancas.push(`Detalhe atualizado`);
        if (antigos.solicitante !== novos.solicitante || antigos.sobrenome !== novos.sobrenome) mudancas.push(`Solicitante alterado`);
        if (antigos.contato !== novos.contato) mudancas.push(`Contato alterado`);
        if (mudancas.length === 0) mudancas.push("Reencaminhado sem alterações");

        await updateDoc(docRef, { 
            ...novos, 
            historicoLogs: arrayUnion(`[${novaHora}] Alterado por ${nomeUsuarioLogado} | ${mudancas.join(" | ")}`) 
        });
        
        registrarLogAuditoria("ENCAMINHAR OCORRÊNCIA", `Registro nº ${antigos.numRegistro} alterado por ${nomeUsuarioLogado}. Detalhes: ${mudancas.join(", ")}`);

        alert("✅ Atualizado com sucesso!");
        fecharModal();
    };

    let conclusaoPendente = null;

    window.concluirOcorrencia = (id, dadosAntigos) => {
        if (isVisualizador) return;
        conclusaoPendente = {id, dadosAntigos};
        const inputId = document.getElementById('concluirId');
        const textarea = document.getElementById('concluirResultado');
        const modal = document.getElementById('modalConcluirOcorrencia');

        if (inputId) inputId.value = id;
        if (textarea) {
            textarea.value = dadosAntigos.resultadoFinal || "";
            setTimeout(() => textarea.focus(), 50);
        }
        if (modal) modal.style.display = 'flex';
    };

    window.fecharModalConcluir = () => {
        const modal = document.getElementById('modalConcluirOcorrencia');
        const textarea = document.getElementById('concluirResultado');
        if (modal) modal.style.display = 'none';
        if (textarea) textarea.value = "";
        conclusaoPendente = null;
    };

    window.confirmarConclusaoOcorrencia = async () => {
        if (isVisualizador || !conclusaoPendente) return;

        const {id, dadosAntigos} = conclusaoPendente;
        const textarea = document.getElementById('concluirResultado');
        const res = textarea?.value || "";

        if (res.trim() === "") {
            alert("⚠️ ERRO: É OBRIGATÓRIO escrever o Resultado Final.");
            textarea?.focus();
            return;
        }

        const hF = getHoraAtual();
        await updateDoc(doc(db, "ocorrencias_sttu", id), { 
            situacao: 'CONCLUÍDA', 
            resultadoFinal: res.toUpperCase(), 
            horaFinal: hF,
            historicoLogs: arrayUnion(`[${hF}] Concluído por ${nomeUsuarioLogado}`)
        });

        registrarLogAuditoria("CONCLUIR OCORRÊNCIA", `Registro nº ${dadosAntigos.numRegistro} finalizado por ${nomeUsuarioLogado}. Resultado: ${res}`);

        fecharModalConcluir();
        alert("✅ Ocorrência concluída com sucesso!");
    };

    window.excluirOcorrencia = async (id, numRegistro) => {
        if (!usuarioEhAdmin) {
            alert("⛔ Acesso Negado: Apenas administradores podem excluir registros.");
            return;
        }

        const confirmacao = confirm(`⚠️ PERIGO - AÇÃO IRREVERSÍVEL ⚠️\n\nTem certeza que deseja EXCLUIR PERMANENTEMENTE a ocorrência Nº ${numRegistro}?\n\nIsso apagará todo o histórico e dados deste registro.`);
        
        if (confirmacao) {
            try {
                await deleteDoc(doc(db, "ocorrencias_sttu", id));
                registrarLogAuditoria("EXCLUSÃO DE REGISTRO", `Ocorrência Nº ${numRegistro} foi excluída permanentemente por ${nomeUsuarioLogado}.`);
                alert("🗑️ Registro excluído com sucesso.");
            } catch (error) {
                console.error("Erro ao excluir:", error);
                alert("Erro ao excluir. Verifique o console ou suas permissões.");
            }
        }
    };

    const elForm = document.getElementById('registroForm');
    if (elForm) {
        elForm.onsubmit = async (e) => {
            if (isVisualizador) { e.preventDefault(); return; }
            e.preventDefault();
            
            const solicitante = document.getElementById('solicitante').value.trim();
            const sobrenome = document.getElementById('sobrenome').value.trim();
            const contato = document.getElementById('contato').value.trim();
            let ocorrencia = document.getElementById('ocorrencia').value;
            const local = document.getElementById('local').value.trim();
            const detalhamento = document.getElementById('detalhamento').value.trim();
            const zona = document.getElementById('zona').value;
            let horaEnvio = document.getElementById('horaEnvio').value;
            const situacao = document.getElementById('situacao').value;
            const situacaoFinal = resolverSituacaoPorEquipe(situacao, equipesSelecionadas);
            const resultadoFinal = document.getElementById('resultadoFinal').value.trim();
            let horaFinalValor = document.getElementById('horaFinal').value;
            
            const divSub = document.getElementById('subtipoContainer');
            if (divSub.style.display === 'block') {
                const subtipo = document.getElementById('subtipoSelect').value;
                if (subtipo) ocorrencia = `${ocorrencia} (${subtipo})`;
            }

            const isExcecao = (ocorrencia.includes("VEÍCULO ABANDONADO") || situacaoFinal === "NÃO ATENDIDA" || situacaoFinal === "PARA O DESPACHO" || situacaoFinal === "CONCLUÍDA" || situacaoFinal === "PARA O PRÓXIMO TURNO");

            if (!solicitante || !sobrenome || !contato || !ocorrencia || !local || !detalhamento || !zona || !situacao) {
                alert("⚠️ Preencha os campos básicos obrigatórios!"); return;
            }

            if (!horaEnvio) { horaEnvio = getHoraAtual(); }

            if (!isExcecao) {
                if (equipesSelecionadas.length === 0) { alert("⚠️ Selecione pelo menos uma EQUIPE!"); return; }
            }

            if (situacaoFinal === 'CONCLUÍDA') {
                if (!resultadoFinal) { alert("⚠️ Para CONCLUÍDA, preencha o RESULTADO FINAL!"); return; }
                if (!horaFinalValor) { horaFinalValor = getHoraAtual(); }
            }

            try {
                await runTransaction(db, async (transaction) => {
                    const contadorRef = doc(db, "config", "contador");
                    const contadorSnap = await transaction.get(contadorRef);

                    let atual = 0;
                    if (contadorSnap.exists()) {
                        atual = contadorSnap.data().atual || 0;
                    }

                    const novoNumeroInt = atual + 1;
                    const numFormatado = String(novoNumeroInt).padStart(3, '0');

                    const novaOcorrenciaRef = doc(collection(db, "ocorrencias_sttu"));

                    const dados = {
                        numRegistro: numFormatado,
                        solicitante: solicitante.toUpperCase(),
                        sobrenome: sobrenome.toUpperCase(),
                        contato: contato.toUpperCase(),
                        ocorrencia: ocorrencia,
                        local: local.toUpperCase(),
                        detalhamento: detalhamento.toUpperCase(),
                        zona: zona,
                        equipe: equipesSelecionadas.join(", "),
                        horaEnvio: horaEnvio || "--:--",
                        situacao: situacaoFinal,
                        horaFinal: horaFinalValor,
                        resultadoFinal: resultadoFinal.toUpperCase(),
                        timestamp: serverTimestamp(),
                        data_filtro: getDataHojeISO(), 
                        historicoLogs: [`[${horaEnvio}] Criado por ${nomeUsuarioLogado}`] 
                    };

                    transaction.set(contadorRef, { atual: novoNumeroInt }, { merge: true });
                    transaction.set(novaOcorrenciaRef, dados);
                });

                registrarLogAuditoria("CRIAR OCORRÊNCIA", `Nova ocorrência global criada por ${nomeUsuarioLogado}.`);
                
                document.getElementById('registroForm').reset();
                document.getElementById('numRegistro').value = "GERADO AO SALVAR";
                
                equipesSelecionadas = [];
                renderizarEquipes('containerEquipes', equipesSelecionadas, (r) => equipesSelecionadas = []);
                popularEquipes('equipeSelect');
                window.verificarRegrasObrigatoriedade();
                
                alert("✅ Ocorrência registrada com sucesso!");

            } catch (error) {
                console.error("Erro na transação:", error);
                alert("❌ Erro ao salvar registro. Tente novamente.");
            }
        };
    }

    async function registrarLogAuditoria(acao, detalhes) {
        if (isVisualizador) return;
        try {
            await addDoc(collection(db, "logs_auditoria"), {
                usuario: nomeUsuarioLogado || "DESCONHECIDO",
                acao: acao.toUpperCase(),
                detalhes: detalhes,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Erro ao gerar log:", e);
        }
    }

    popularEquipes('equipeSelect');
    popularEquipes('editEquipeSelect'); 
    
    const btnDownloadCSV = document.getElementById('btnDownloadCSV');
    if (btnDownloadCSV) btnDownloadCSV.onclick = () => {
        const table = document.getElementById('relatorioTable');
        let csv = ["\ufeffNº,SOLICITANTE,CONTATO,OCORRENCIA,LOCAL,DETALHE,ZONA,EQUIPE,ENVIO,STATUS,FINAL,RESULTADO,HISTORICO"];
        for(let i=0; i<table.rows.length; i++) {
            let r = [];
            const tr = table.rows[i];
            for(let j=0; j<tr.cells.length; j++) {
                if (j === tr.cells.length - 1) continue;
                let texto = tr.cells[j].innerText;
                if (tr.cells[j].classList.contains('col-hist')) {
                      texto = Array.from(tr.cells[j].querySelectorAll('li')).map(li => li.innerText).join(" | ");
                }
                r.push(`"${texto.replace(/"/g, '""').replace(/\n/g, ' ')}"`);
            }
            csv.push(r.join(","));
        }
        const b = new Blob([csv.join("\n")], {type: 'text/csv;charset=utf-8;'});
        const l = document.createElement('a');
        l.href = URL.createObjectURL(b);
        l.download = `ocorrencias_sttu_completo_${new Date().getTime()}.csv`;
        l.click();
    };

    window.fecharModal = fecharModal;
    window.confirmarEncaminhamento = confirmarEncaminhamento;
    window.abrirModalEncaminhar = abrirModalEncaminhar;
    window.concluirOcorrencia = concluirOcorrencia;
    window.excluirOcorrencia = excluirOcorrencia;
}

iniciarOcorrencias().catch((error) => {
    console.error("Erro ao carregar ocorrencias:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});



