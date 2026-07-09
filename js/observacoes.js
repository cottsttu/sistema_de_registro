async function iniciarObservacoes() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, addDoc, query, onSnapshot, orderBy, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, where, getDocs} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");

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
        if (acao === "habilitado") {
            return permissaoModulo?.habilitado === true
                || permissaoModulo?.habilitado === "true"
                || permissaoModulo?.visualizar === true
                || permissaoModulo?.visualizar === "true";
        }
        return permissaoModulo?.[acao] === true || permissaoModulo?.[acao] === "true";
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

    const listarAgentesCondutoresUrl = "https://us-central1-sttu-registros.cloudfunctions.net/listarAgentesCondutoresHttp";
    let agentesDB = [...(window.STTU_AGENTES_PADRAO || [])];
    let agentesDatalistDisponiveis = [];

    let nomeUsuarioLogado = "ANÔNIMO";
    let isVisualizador = false;
    let isAdmin = false;
    let usuarioPodeCriar = false;
    let usuarioPodeEditar = false;
    let usuarioPodeExcluir = false;
    let usuarioPodeOperar = false;
    let maletasRegistradasHoje = new Set();
    let registrosObservacoesHoje = [];

    function normalizarListaAgentes(lista) {
        return [...new Set((lista || [])
            .map((agente) => String(agente || "").trim().toUpperCase())
            .filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    function normalizarBuscaAgente(valor) {
        return String(valor || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim();
    }

    function filtrarAgentesDisponiveis(valor = "", mostrarTodos = false) {
        const termo = normalizarBuscaAgente(valor);
        if (!mostrarTodos && termo.length < 1) return [];
        return agentesDatalistDisponiveis
            .filter((agente) => mostrarTodos || normalizarBuscaAgente(agente).startsWith(termo))
            .slice(0, mostrarTodos ? 300 : 30);
    }

    function atualizarDatalistAgentes(valor = "", mostrarTodos = true) {
        const dataList = document.getElementById('listaAgentes');
        if (!dataList) return;

        dataList.innerHTML = '';
        filtrarAgentesDisponiveis(valor, true).forEach((agente) => {
                const optData = document.createElement('option');
                optData.value = agente;
                dataList.appendChild(optData);
            });
    }

    function prepararCampoAgenteComSeta(campo) {
        if (!campo || campo.dataset.agentPickerReady === "true") return;
        campo.dataset.agentPickerReady = "true";
        campo.setAttribute('list', 'listaAgentes');
    }

    function preencherListasAgentes(lista = agentesDB) {
        const selectAfast = document.getElementById('afast-lista-agentes');
        selectAfast.innerHTML = '<option value="">-- SELECIONE NA LISTA --</option>';
        
        agentesDatalistDisponiveis = normalizarListaAgentes(lista);
        atualizarDatalistAgentes();

        agentesDatalistDisponiveis.forEach(agente => {
            const optSelect = document.createElement('option');
            optSelect.value = agente;
            optSelect.innerText = agente;
            selectAfast.appendChild(optSelect);
        });
    }

    async function carregarAgentesCondutores(user) {
        preencherListasAgentes(agentesDB);

        try {
            const token = await user.getIdToken(true);
            const resposta = await fetch(listarAgentesCondutoresUrl, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });

            const resultado = await resposta.json().catch(() => ({}));
            if (!resposta.ok || !resultado.ok) {
                throw new Error(resultado.message || `Erro HTTP ${resposta.status}`);
            }

            const agentesServidor = (resultado.agentes || [])
                .map((agente) => agente && typeof agente === "object" ? agente.nome : agente)
                .filter(Boolean);

            if (agentesServidor.length) {
                agentesDB = normalizarListaAgentes(agentesServidor);
                preencherListasAgentes(agentesDB);
            }
        } catch (error) {
            console.error("Erro ao carregar agentes/condutores do servidor:", error);
            agentesDB = normalizarListaAgentes(window.STTU_AGENTES_PADRAO || agentesDB);
            preencherListasAgentes(agentesDB);
        }
    }

    function inicializarFormularioObservacoes() {
        preencherListasAgentes(agentesDB);

        document.getElementById('turno-select').value = "SELECIONE";
        const btn = document.getElementById('btn-registrar-inicio');
        btn.disabled = false;
        btn.innerText = "REGISTRAR INÍCIO DE TURNO";
        btn.style.backgroundColor = "#27ae60";

        document.querySelectorAll('.verificar-item').forEach(el => {
            const marcarConferido = function() {
                this.classList.remove('input-pendente');
                this.classList.add('input-ok');
            };
            el.addEventListener('input', marcarConferido);
            el.addEventListener('change', marcarConferido);
            el.addEventListener('click', marcarConferido);
        });

        document.querySelectorAll('input[type="number"]').forEach((campo) => {
            campo.min = "0";
            campo.addEventListener('keydown', (event) => {
                if (event.key === '-' || event.key === 'e' || event.key === 'E' || event.key === '+') {
                    event.preventDefault();
                }
            });
            campo.addEventListener('input', function() {
                const valor = String(this.value || "").replace(/[^\d]/g, "");
                this.value = valor === "" ? "" : String(Math.max(0, Number(valor)));
            });
            campo.addEventListener('blur', function() {
                if (this.value === "" || Number(this.value) < 0) this.value = "0";
            });
        });

        document.querySelectorAll('input[list="listaAgentes"]').forEach((campo) => {
            prepararCampoAgenteComSeta(campo);
            campo.addEventListener('input', function() {
                const inicio = this.selectionStart;
                const fim = this.selectionEnd;
                this.value = this.value.toUpperCase();
                this.setSelectionRange(inicio, fim);
                this.setAttribute('list', 'listaAgentes');
                atualizarDatalistAgentes();
            });
            campo.addEventListener('focus', function() {
                this.setAttribute('list', 'listaAgentes');
                atualizarDatalistAgentes();
            });
        });
    }

    inicializarFormularioObservacoes();

    function resetarEquipamentos() {
        const ids = [
            'qtd-cel-atend', 'qtd-fonte-cel', 'qtd-cabo-cel', 'qtd-zap',
            'qtd-radio-movel', 'qtd-impressora', 'qtd-ar', 'qtd-radio-fixo'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            el.value = "0";
            el.classList.remove('input-ok');
            el.classList.add('input-pendente');
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    carregarAgentesCondutores(user);
                    
                    nomeUsuarioLogado = dados.nome || "Usuário";
                    document.getElementById('nomeUsuarioDisplay').innerText = "OLÁ, " + nomeUsuarioLogado;

                    const nivel = dados.nivel_acesso || 'total';
                    const cargo = dados.cargo || '';
                    
                    usuarioPodeCriar = temPermissaoModulo(dados, "observacoes", "criar");
                    usuarioPodeEditar = temPermissaoModulo(dados, "observacoes", "editar");
                    usuarioPodeExcluir = temPermissaoModulo(dados, "observacoes", "excluir");
                    usuarioPodeOperar = usuarioPodeCriar || usuarioPodeEditar || usuarioPodeExcluir;
                    isAdmin = usuarioPodeEditar || usuarioPodeExcluir;
                    isVisualizador = !usuarioPodeOperar && cargo !== 'admin';
                    renderizarRegistrosObservacoes(registrosObservacoesHoje);

                    if (!usuarioPodeCriar) {
                        const areaInputs = document.querySelector('.input-section');
                        if(areaInputs) areaInputs.remove();
                    }

                    if (isVisualizador) {
                        console.log("🔒 MODO APENAS LEITURA ATIVADO (NUCLEAR)");
                        
                        const areaModal = document.getElementById('modalDevolucao');
                        if(areaModal) areaModal.remove();

                        const style = document.createElement('style');
                        style.innerHTML = '.btn-baixa, .btn-baixa-falta { display: none !important; }';
                        document.head.appendChild(style);
                        
                        window.darBaixaNoFirebase = () => alert("Acesso Negado: Modo Visualizador.");
                        window.abrirModalFalta = () => alert("Acesso Negado: Modo Visualizador.");
                    }

                    if (!temPermissaoModulo(dados, "relatorios")) {
                        const btnRel = document.getElementById('btnNavRelatorios');
                        if (btnRel) btnRel.style.display = 'none';
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
                        resetarTimer();
                        document.addEventListener('mousemove', resetarTimer);
                        document.addEventListener('keypress', resetarTimer);
                        document.addEventListener('click', resetarTimer);
                        document.addEventListener('scroll', resetarTimer);
                    }
                } else {
                    alert("Erro de cadastro. Contate o suporte.");
                    await signOut(auth);
                    window.location.href = "login.html";
                }
            } catch (error) { console.error("Erro:", error); }
        } else {
            window.location.href = "login.html";
        }
    });

    const btnSair = document.getElementById('btnSair');
    if(btnSair) {
        btnSair.onclick = () => {
            marcarOffline().finally(() => {
                signOut(auth).then(() => { window.location.href = "login.html"; });
            });
        }
    }

    function getDataHojeISO() {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    function getDataHojeBR() {
        const hoje = new Date();
        return hoje.toLocaleDateString('pt-BR');
    }
    document.getElementById('displayData').innerText = "DATA: " + getDataHojeBR();

    const dataFiltro = getDataHojeISO();
    
    const q = query(
        collection(db, "observacoes_sttu"), 
        where("data_filtro", "==", dataFiltro)
    );

    function renderizarRegistrosObservacoes(registros = registrosObservacoesHoje) {
        const lista = document.getElementById('lista-registros');
        lista.innerHTML = "";

        if (!registros.length) {
            atualizarPainelMaletasDia([]);
            lista.innerHTML = "<em>Nenhum registro encontrado para hoje.</em>";
            return;
        }

        atualizarPainelMaletasDia(registros);

        registros.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.seconds : 0;
            const tB = b.timestamp ? b.timestamp.seconds : 0;
            return tB - tA; 
        });

        registros.forEach(data => {
            const id = data.id;
            const horaFormatada = data.timestamp ? new Date(data.timestamp.seconds * 1000).toLocaleString('pt-BR') : "Processando...";
            
            const item = document.createElement('div');
            item.className = 'registro-item';
            
            let html = `
                <div class="timestamp">[${horaFormatada}]</div>
                <div class="texto-registro">
                    <span>${data.texto}</span>
                    ${data.baixa ? `<span class="status-devolvido">| DEVOLVIDO ÀS ${data.baixa}</span>` : ""}
                </div>
            `;

            item.innerHTML = html;

            if ((data.requerBaixa && !data.baixa && usuarioPodeOperar) || usuarioPodeEditar || usuarioPodeExcluir) {
                const btnContainer = document.createElement('div');
                btnContainer.className = 'registro-acoes';
                btnContainer.style.display = 'flex';
                btnContainer.style.flexDirection = 'column';
                btnContainer.style.gap = '5px';
                
                if (data.requerBaixa && !data.baixa && usuarioPodeOperar) {
                    const btnBaixa = document.createElement('button');
                    btnBaixa.className = 'btn btn-baixa';
                    btnBaixa.innerText = 'DAR BAIXA / DEVOLVER';
                    btnBaixa.onclick = () => window.darBaixaNoFirebase(id);
                    
                    const btnBaixaFalta = document.createElement('button');
                    btnBaixaFalta.className = 'btn btn-baixa-falta';
                    btnBaixaFalta.innerText = 'DEVOLVER C/ MATERIAIS EM FALTA';
                    btnBaixaFalta.onclick = () => window.abrirModalFalta(id, data.texto); 

                    btnContainer.appendChild(btnBaixa);
                    btnContainer.appendChild(btnBaixaFalta);
                }

                if (usuarioPodeEditar) {
                    const btnEditar = document.createElement('button');
                    btnEditar.className = 'btn btn-editar-registro';
                    btnEditar.innerText = 'EDITAR';
                    btnEditar.onclick = () => window.editarRegistroObservacao(id, data.texto || "");
                    btnContainer.appendChild(btnEditar);
                }

                if (usuarioPodeExcluir) {
                    const btnExcluir = document.createElement('button');
                    btnExcluir.className = 'btn btn-excluir-registro';
                    btnExcluir.innerText = 'EXCLUIR';
                    btnExcluir.onclick = () => window.excluirRegistroObservacao(id);
                    btnContainer.appendChild(btnExcluir);
                }
                
                item.appendChild(btnContainer);
            }
            
            lista.appendChild(item);
        });
    }

    onSnapshot(q, (snapshot) => {
        registrosObservacoesHoje = [];
        snapshot.forEach(doc => { registrosObservacoesHoje.push({ id: doc.id, ...doc.data() }); });
        renderizarRegistrosObservacoes(registrosObservacoesHoje);
    });

    function atualizarPainelMaletasDia(registros) {
        const maletas = registros
            .filter((registro) => registro.tipo_registro === "ENTREGA_MALETA" && !registro.baixa)
            .map((registro) => String(registro.numero_maleta || "").replace(/\D/g, ""))
            .filter(Boolean);

        const unicas = [...new Set(maletas)].sort((a, b) => Number(a) - Number(b));
        maletasRegistradasHoje = new Set(unicas);

        const total = document.getElementById('maletas-dia-total');
        const lista = document.getElementById('maletas-dia-lista');
        if (total) total.textContent = String(unicas.length);
        if (lista) {
            lista.innerHTML = unicas.length
                ? unicas.map((n) => `<span class="maleta-dia-badge">Nº ${n}</span>`).join('')
                : 'Nenhuma em campo';
        }
    }

    async function salvarObservacao(texto, requerBaixa = false, extras = {}) {
        if (!usuarioPodeCriar) return alert("Acesso Negado.");

        try {
            const dados = {
                texto: texto.toUpperCase(),
                requerBaixa: requerBaixa,
                baixa: null,
                timestamp: serverTimestamp(),
                data_filtro: getDataHojeISO(), 
                ...extras
            };

            await addDoc(collection(db, "observacoes_sttu"), dados);
            registrarLogAuditoria("NOVA OBSERVAÇÃO", `Texto: "${texto.substring(0, 50)}..."`);

        } catch (e) {
            console.error("Erro ao salvar: ", e);
            alert("Erro ao conectar com o banco de dados.");
        }
    }

    async function registrarLogAuditoria(acao, detalhes) {
        if (!usuarioPodeCriar && !usuarioPodeEditar && !usuarioPodeExcluir) return; 
        try {
            await addDoc(collection(db, "logs_auditoria"), {
                usuario: nomeUsuarioLogado || "DESCONHECIDO",
                acao: acao.toUpperCase(),
                detalhes: detalhes,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error(e); }
    }

    window.editarRegistroObservacao = async (idDoc, textoAtual) => {
        if (!usuarioPodeEditar) return alert("Acesso negado.");
        const novoTexto = prompt("Edite o texto do registro:", textoAtual);
        if (novoTexto === null) return;

        const texto = novoTexto.trim();
        if (!texto) return alert("O texto do registro não pode ficar vazio.");

        try {
            await updateDoc(doc(db, "observacoes_sttu", idDoc), {
                texto: texto.toUpperCase(),
                editadoPor: nomeUsuarioLogado,
                editadoEm: serverTimestamp()
            });
            registrarLogAuditoria("EDITAR OBSERVAÇÃO", `Registro ${idDoc} editado por ${nomeUsuarioLogado}`);
        } catch (error) {
            console.error("Erro ao editar registro:", error);
            alert("Erro ao editar registro.");
        }
    };

    window.excluirRegistroObservacao = async (idDoc) => {
        if (!usuarioPodeExcluir) return alert("Acesso negado.");
        const confirmar = confirm("Tem certeza que deseja excluir este registro permanentemente?");
        if (!confirmar) return;

        try {
            await deleteDoc(doc(db, "observacoes_sttu", idDoc));
            registrarLogAuditoria("EXCLUIR OBSERVAÇÃO", `Registro ${idDoc} excluído por ${nomeUsuarioLogado}`);
        } catch (error) {
            console.error("Erro ao excluir registro:", error);
            alert("Erro ao excluir registro.");
        }
    };

    window.darBaixaNoFirebase = async (idDoc) => {
        if (!usuarioPodeOperar) return alert("Acesso Negado.");
        const conferente = prompt("POR FAVOR, DIGITE O NOME DO AGENTE QUE ESTÁ CONFERINDO A DEVOLUÇÃO:");
        if (!conferente || conferente.trim() === "") return;

        const agora = new Date().toLocaleTimeString('pt-BR');
        const docRef = doc(db, "observacoes_sttu", idDoc);
        const docSnap = await getDoc(docRef);
        const textoComConferencia = docSnap.data().texto + ` | CONFERIDO POR: ${conferente.toUpperCase()}`;

        await updateDoc(docRef, { baixa: agora, texto: textoComConferencia });
        registrarLogAuditoria("BAIXA DE MATERIAL", `Item devolvido (ID: ${idDoc}). Conferido por: ${conferente}`);
    }

    // --- NOVA FUNÇÃO DO MODAL (ATUALIZADA) ---
    window.abrirModalFalta = (id, texto) => {
        if (!usuarioPodeOperar) return alert("Acesso Negado.");
        document.getElementById('id-devolucao-atual').value = id;

        // Função hiper-resistente que ignora pontuações e espaços para achar o número exato
        const extrairQtd = (chave, padrao) => {
            if (!texto) return padrao;
            try {
                // Procura o nome da chave, ignora o que não for número (\D*) e captura os números (\d+)
                const regex = new RegExp(`${chave}\\D*(\\d+)`, 'i');
                const match = String(texto).match(regex);
                return match ? match[1] : padrao;
            } catch (e) {
                return padrao;
            }
        };

        // Preenchendo as caixas do modal com os valores exatos que foram entregues
        document.getElementById('dev-etil').value = extrairQtd("ETIL", 1);
        document.getElementById('dev-piteira').value = extrairQtd("PITEIRA", 2);
        document.getElementById('dev-impressora').value = extrairQtd("IMP", 1);
        document.getElementById('dev-carregadores').value = extrairQtd("CARR", 5);
        document.getElementById('dev-bobina').value = extrairQtd("BOB", 1);
        document.getElementById('dev-boat').value = extrairQtd("BOAT", 2);
        document.getElementById('dev-certificado').value = extrairQtd("CERT", 2);
        document.getElementById('dev-tc').value = extrairQtd("TC", 2);
        document.getElementById('dev-manual').value = extrairQtd("MAN", 2);

        // Limpa o campo do nome para não ficar salvo o nome da última devolução
        document.getElementById('dev-responsavel').value = "";

        document.getElementById('modalDevolucao').style.display = 'flex';
    };

    window.fecharModal = () => document.getElementById('modalDevolucao').style.display = 'none';

    window.confirmarBaixaComFalta = async () => {
        if (!usuarioPodeOperar) return alert("Acesso Negado.");
        const idDoc = document.getElementById('id-devolucao-atual').value;
        const conferente = document.getElementById('dev-responsavel').value.trim().toUpperCase();
        if (!conferente) return alert("Informe quem conferiu.");

        const agora = new Date().toLocaleTimeString('pt-BR');
        const docRef = doc(db, "observacoes_sttu", idDoc);
        
        const etil = document.getElementById('dev-etil').value;
        const piteira = document.getElementById('dev-piteira').value;
        const imp = document.getElementById('dev-impressora').value;
        const car = document.getElementById('dev-carregadores').value;
        const bob = document.getElementById('dev-bobina').value;
        const boat = document.getElementById('dev-boat').value;
        const cert = document.getElementById('dev-certificado').value;
        const tc = document.getElementById('dev-tc').value;
        const manual = document.getElementById('dev-manual').value;

        const docSnap = await getDoc(docRef);
        const obsFalta = `\n[DEVOLUÇÃO C/ PENDÊNCIA: ETIL:${etil}, PITEIRA:${piteira}, IMP:${imp}, CARR:${car}, BOB:${bob}, BOAT:${boat}, CERT:${cert}, TC:${tc}, MAN:${manual}] | CONFERIDO POR: ${conferente}`;

        await updateDoc(docRef, { baixa: agora, texto: docSnap.data().texto + obsFalta });
        registrarLogAuditoria("BAIXA COM FALTA", `Item devolvido com pendências (ID: ${idDoc}). Conferido por: ${conferente}`);

        fecharModal();
    };

    document.querySelectorAll('.btn-linha').forEach(btn => {
        btn.onclick = () => {
            if (!usuarioPodeCriar) return;
            if (btn.classList.contains('ok')) { btn.classList.remove('ok'); btn.classList.add('nok'); }
            else if (btn.classList.contains('nok')) { btn.classList.remove('nok'); }
            else { btn.classList.add('ok'); }
        };
    });

    document.getElementById('turno-select').addEventListener('change', async function() {
        if (!usuarioPodeCriar) return;
        const turno = this.value;
        const btn = document.getElementById('btn-registrar-inicio');

        if (turno === "SELECIONE") {
            btn.disabled = false;
            btn.innerText = "REGISTRAR INÍCIO DE TURNO";
            btn.style.backgroundColor = "#27ae60"; 
            return;
        }

        btn.disabled = true;
        btn.innerText = "VERIFICANDO DISPONIBILIDADE...";

        const qVerificacao = query(
            collection(db, "observacoes_sttu"), 
            where("tipo_registro", "==", "INICIO_TURNO"),
            where("data_controle", "==", getDataHojeISO()), 
            where("turno_controle", "==", turno)
        );

        const snapshot = await getDocs(qVerificacao);

        if (!snapshot.empty) {
            btn.innerText = `TURNO ${turno} JÁ REGISTRADO!`;
            btn.style.backgroundColor = "#95a5a6"; 
            btn.disabled = true;
        } else {
            btn.innerText = "REGISTRAR INÍCIO DE TURNO";
            btn.style.backgroundColor = "#27ae60"; 
            btn.disabled = false;
        }
    });

    document.getElementById('btn-registrar-inicio').onclick = async () => {
        if (!usuarioPodeCriar) return;
        const btn = document.getElementById('btn-registrar-inicio');
        btn.disabled = true;

        const turno = document.getElementById('turno-select').value;
        const nomeAgente = document.getElementById('agente-turno-nome').value.trim().toUpperCase();

        if (turno === "SELECIONE" || !nomeAgente) {
             alert("Preencha Turno e Nome do Agente.");
             btn.disabled = false; return;
        }

        const textoOperadora = document.getElementById('texto-operadora').value.trim();
        if (!textoOperadora) {
            alert("⚠️ É obrigatório preencher a situação das OPERADORAS.");
            document.getElementById('texto-operadora').focus();
            btn.disabled = false; return;
        }

        const btnLinhas = document.querySelectorAll('.btn-linha');
        let todosTestados = true;
        btnLinhas.forEach(b => {
            if (!b.classList.contains('ok') && !b.classList.contains('nok')) { todosTestados = false; }
        });

        if (!todosTestados) {
            alert("⚠️ É OBRIGATÓRIO verificar todos os números de telefone.");
            btn.disabled = false; return;
        }

        const inputsEquip = document.querySelectorAll('.verificar-item');
        let equipPendente = false;
        inputsEquip.forEach(el => {
            if (el.classList.contains('input-pendente')) {
                equipPendente = true;
            }
        });

        if (equipPendente) {
            alert("⚠️ É OBRIGATÓRIO conferir todos os itens (Os campos em VERMELHO devem ser clicados/modificados).");
            btn.disabled = false; return;
        }

        const qVerificacao = query(
            collection(db, "observacoes_sttu"), 
            where("tipo_registro", "==", "INICIO_TURNO"),
            where("data_controle", "==", getDataHojeISO()), 
            where("turno_controle", "==", turno)
        );
        const snapshot = await getDocs(qVerificacao);
        
        if (!snapshot.empty) {
            alert(`ERRO: O turno ${turno} já foi registrado!`);
            btn.innerText = `TURNO ${turno} JÁ REGISTRADO!`;
            btn.style.backgroundColor = "#95a5a6";
            return;
        }

        let statusLinhas = [];
        btnLinhas.forEach(b => {
            if (b.classList.contains('ok')) statusLinhas.push(`${b.getAttribute('data-num')}: OK`);
            else if (b.classList.contains('nok')) statusLinhas.push(`${b.getAttribute('data-num')}: INOPERANTE`);
        });
        const textoLinhas = statusLinhas.length > 0 ? ` | LINHAS: ${statusLinhas.join(', ')}` : "";

        const detalhes = `SERVIÇO INICIADO TURNO ${turno} - AGENTE: ${nomeAgente}${textoLinhas}. ` +
            `OPERADORAS: ${textoOperadora.toUpperCase()}. ` + 
            `CONFERÊNCIA: ` +
            `CEL.ATEND:${document.getElementById('qtd-cel-atend').value}, ` +
            `FONTE:${document.getElementById('qtd-fonte-cel').value}, ` +
            `CABO:${document.getElementById('qtd-cabo-cel').value}, ` +
            `ZAP:${document.getElementById('qtd-zap').value}, ` +
            `RAD.MOV:${document.getElementById('qtd-radio-movel').value}, ` +
            `IMP:${document.getElementById('qtd-impressora').value}, ` +
            `AR:${document.getElementById('qtd-ar').value}, ` +
            `RAD.FIX:${document.getElementById('qtd-radio-fixo').value}`;
        
        await salvarObservacao(detalhes, false, {
            tipo_registro: "INICIO_TURNO",
            data_controle: getDataHojeISO(),
            turno_controle: turno
        });
        
        registrarLogAuditoria("INÍCIO DE TURNO", `Turno ${turno} iniciado por ${nomeAgente}`);
        alert("Início registrado com sucesso!");
        btn.innerText = "REGISTRADO COM SUCESSO";
        resetarEquipamentos();
        document.getElementById('texto-operadora').value = "";
    };

    document.getElementById('btn-registrar-maleta').onclick = async () => {
        if (!usuarioPodeCriar) return;
        const nomeAgente = document.getElementById('agente-turno-nome').value.trim().toUpperCase();
        if (!nomeAgente) { alert("Preencha o Nome do Agente no topo primeiro."); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

        let maleta = document.getElementById('maleta-selecionada').value;
        const maletaCustomizada = document.getElementById('maleta-customizada').value.trim();
        
        if (maletaCustomizada) {
            maleta = maletaCustomizada.replace(/\D/g, "");
        }

        if (maleta && maletasRegistradasHoje.has(maleta)) {
            alert(`⚠️ A MALETA Nº ${maleta} ainda está em campo. Dê baixa nela antes de registrar novamente.`);
            document.getElementById('maleta-customizada').focus();
            return;
        }
        
        const entreguePara = document.getElementById('entregue-para').value.trim().toUpperCase();
        if (!entreguePara) {
            alert("⚠️ CAMPO OBRIGATÓRIO: Informe para quem a maleta/item foi entregue.");
            document.getElementById('entregue-para').focus();
            return;
        }

        const obs = document.getElementById('obs-extras').value.trim();

        if (maleta) {
            const qCheck = query(collection(db, "observacoes_sttu"), 
                where("tipo_registro", "==", "ENTREGA_MALETA"),
                where("numero_maleta", "==", maleta),
                where("baixa", "==", null) 
            );
            const snapshot = await getDocs(qCheck);
            
            if (!snapshot.empty) {
                const docPreso = snapshot.docs[0];
                const confirmar = confirm(`ERRO: A MALETA Nº ${maleta} consta como EM USO por outro agente desde ${new Date(docPreso.data().timestamp.seconds * 1000).toLocaleString()}.\n\nDeseja FORÇAR a devolução da anterior para liberar esta nova entrega?`);
                if (confirmar) {
                   await updateDoc(doc(db, "observacoes_sttu", docPreso.id), { 
                       baixa: new Date().toLocaleTimeString('pt-BR') + " (FORÇADO)", 
                       texto: docPreso.data().texto + " | BAIXA FORÇADA PELO SISTEMA PARA NOVA ENTREGA" 
                   });
                   alert("Registro anterior baixado. Tente registrar novamente agora.");
                   return;
                } else { return; }
            }
        }

        const qtdEtil = document.getElementById('qtd-etil').value;
        const qtdPiteira = document.getElementById('qtd-piteira').value;
        const qtdImp = document.getElementById('qtd-impressora-maleta').value;
        const qtdCar = document.getElementById('qtd-carregadores').value;
        const qtdBob = document.getElementById('qtd-bobina').value;
        const qtdBoat = document.getElementById('qtd-boat').value;
        const qtdCert = document.getElementById('qtd-certificado').value;
        const qtdTc = document.getElementById('qtd-tc').value;
        const qtdMan = document.getElementById('qtd-manual').value;

        const textoMaleta = maleta ? `DA MALETA Nº ${maleta}` : 'DE EQUIPAMENTOS';
        const detalhes = `ENTREGA ${textoMaleta}. ` +
            `RETIRADO POR: ${nomeAgente}. ` + 
            `ENTREGUE PARA: ${entreguePara}. ` + 
            `ITENS: ETIL:${qtdEtil}, PITEIRA:${qtdPiteira}, IMP:${qtdImp}, CARR:${qtdCar}, BOB:${qtdBob}, ` +
            `BOAT:${qtdBoat}, CERT:${qtdCert}, TC:${qtdTc}, MAN:${qtdMan} ${obs ? '| OBS: '+obs : ''}`;
        
        await salvarObservacao(detalhes, true, {
            tipo_registro: "ENTREGA_MALETA",
            numero_maleta: maleta || "OUTROS"
        });

        document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
        document.getElementById('maleta-selecionada').value = "";
        document.getElementById('maleta-customizada').value = "";
        document.getElementById('obs-extras').value = "";
        document.getElementById('entregue-para').value = ""; 
    };

    document.getElementById('btn-registrar-afastamento').onclick = () => {
        if (!usuarioPodeCriar) return;
        const nomeLista = document.getElementById('afast-lista-agentes').value;
        const nomeDigitado = document.getElementById('afast-nome').value.trim();
        const nomeFinal = nomeLista || nomeDigitado;
        const local = document.getElementById('afast-local').value.trim();
        const status = document.getElementById('afast-status').value;

        if (!nomeFinal) return alert("Informe o agente.");
        salvarObservacao(`AUSÊNCIA: . ${nomeFinal.toUpperCase()} - LOCAL: ${local.toUpperCase()} - SITUAÇÃO: ${status}`);
        document.getElementById('afast-lista-agentes').value = "";
        document.getElementById('afast-nome').value = "";
        document.getElementById('afast-local').value = "";
    };

    document.getElementById('btn-registrar-remocao').onclick = () => {
    if (!usuarioPodeCriar) return;

    // Coleta de todos os campos
    const placa = document.getElementById('rem-placa').value.trim().toUpperCase();
    const equipe = document.getElementById('rem-equipe').value.trim().toUpperCase();
    const local = document.getElementById('rem-local').value.trim().toUpperCase();
    const motivo = document.getElementById('rem-motivo').value.trim().toUpperCase();
    const ait = document.getElementById('rem-ait').value.trim().toUpperCase();
    const trv = document.getElementById('rem-trv').value.trim().toUpperCase();

    // Validação básica
    if (!placa || !motivo) return alert("Preencha ao menos Placa e Motivo.");

    // Montagem do texto incluindo AIT e TRV
    let textoFinal = `VEÍCULO REMOVIDO: PLACA ${placa}`;
    if (equipe) textoFinal += ` - EQUIPE: ${equipe}`;
    if (local)  textoFinal += ` - LOCAL: ${local}`;
    textoFinal += ` - MOTIVO: ${motivo}`;
    if (ait)    textoFinal += ` - AIT: ${ait}`;
    if (trv)    textoFinal += ` - TRV: ${trv}`;

    // Salva no banco de dados
    salvarObservacao(textoFinal);

    // Limpa os campos após o sucesso
    document.getElementById('rem-placa').value = "";
    document.getElementById('rem-equipe').value = "";
    document.getElementById('rem-local').value = "";
    document.getElementById('rem-motivo').value = "";
    document.getElementById('rem-ait').value = "";
    document.getElementById('rem-trv').value = "";
    
    alert("Remoção registrada com sucesso!");
};
    
    document.getElementById('btn-registrar-inspetor').onclick = () => {
        if (!usuarioPodeCriar) return;
        const relato = document.getElementById('texto-inspetor').value.trim();
        if (relato) { salvarObservacao(`RELATO DO INSPETOR: ${relato}`); document.getElementById('texto-inspetor').value = ""; }
    };

    document.getElementById('btn-registrar-obs-geral').onclick = () => {
        if (!usuarioPodeCriar) return;
        const obs = document.getElementById('texto-obs-geral').value.trim();
        if (obs) { salvarObservacao(`OBSERVAÇÃO GERAL: ${obs}`); document.getElementById('texto-obs-geral').value = ""; }
    };

    document.getElementById('btn-registrar-cones').onclick = () => {
        if (!usuarioPodeCriar) return;
        const equipe = document.getElementById('cone-equipe').value;
        const local = document.getElementById('cone-local').value.trim().toUpperCase();
        let col = parseInt(document.getElementById('cone-colocado').value) || 0;
        let rec = parseInt(document.getElementById('cone-recolhido').value) || 0;
        const obs = document.getElementById('cone-obs').value.trim().toUpperCase();
        
        let total = parseInt(document.getElementById('total-cones-geral').value) || 0;
        total = total - col + rec;
        document.getElementById('total-cones-geral').value = total;
        
        salvarObservacao(`CONTROLE DE CONES: ${equipe} - LOCAL: ${local} - COLOCADOS: ${col} - RECOLHIDOS: ${rec} - OBS: ${obs} - SALDO: ${total}`);
        document.getElementById('cone-local').value = "";
        document.getElementById('cone-colocado').value = "";
        document.getElementById('cone-recolhido').value = "";
        document.getElementById('cone-obs').value = "";
    };

    document.getElementById('btn-registrar-complementar').onclick = () => {
        if (!usuarioPodeCriar) return;
        const nome = document.getElementById('comp-nome').value.trim().toUpperCase();
        const funcao = document.getElementById('comp-funcao').value.trim().toUpperCase();
        if (nome && funcao) {
            const textoFinal = `EQUIPE COMPLEMENTAR: NOME: ${nome} - FUNÇÃO: ${funcao}`;
            salvarObservacao(textoFinal);
            document.getElementById('comp-nome').value = "";
            document.getElementById('comp-funcao').value = "";
        } else {
            alert("Preencha o nome e a função!");
        }
    };

    document.querySelectorAll('.btn-maleta').forEach(botao => {
        botao.onclick = () => {
            const selecionada = botao.classList.contains('selecionada');
            document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
            if (!selecionada) {
                botao.classList.add('selecionada');
                document.getElementById('maleta-selecionada').value = botao.getAttribute('data-id');
                document.getElementById('maleta-customizada').value = "";
            } else {
                document.getElementById('maleta-selecionada').value = "";
            }
        };
    });

    document.getElementById('maleta-customizada').addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, "").slice(0, 4);
        document.querySelectorAll('.btn-maleta').forEach(b => b.classList.remove('selecionada'));
        document.getElementById('maleta-selecionada').value = "";
    });
}

iniciarObservacoes().catch((error) => {
    console.error("Erro ao carregar observacoes:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});




