async function iniciarEstatisticas() {
    const {initializeApp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const {getFirestore, collection, getDocs, query, doc, getDoc, updateDoc, serverTimestamp} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");
    const {getAuth, onAuthStateChanged, signOut} = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");const firebaseConfig = {
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

    // VARIÁVEIS GLOBAIS
    let RAW_OCORRENCIAS = [];
    let RAW_AGENTES = [];
    let charts = {};
    window.OCORRENCIAS_FILTRADAS = []; 
    window.AGENTES_FILTRADOS = []; 

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

    async function adicionarEmblemaPdf(doc, x = 14, y = 8, largura = 22, altura = 22) {
        try {
            const emblema = await carregarImagemPdf("src/emblemasttu_relatorios.png");
            doc.addImage(emblema, "PNG", x, y, largura, altura);
        } catch (error) {
            console.error("Erro ao inserir o emblema no PDF:", error);
        }
    }

    function normalizarHora(valor) {
        const texto = String(valor || "").trim();
        const match = texto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return "00:00:00";
        const hora = match[1].padStart(2, "0");
        const minuto = match[2].padStart(2, "0");
        const segundo = (match[3] || "00").padStart(2, "0");
        return `${hora}:${minuto}:${segundo}`;
    }

    function timestampOcorrencia(registro) {
        if (!registro || !registro.data_filtro) return Number.MAX_SAFE_INTEGER;
        const dataHora = `${registro.data_filtro}T${normalizarHora(registro.horaEnvio || registro.horaInicio || registro.hora)}`;
        const timestamp = new Date(dataHora).getTime();
        return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
    }

    function timestampAgente(registro) {
        if (!registro || !registro.dataRelatorio) return Number.MAX_SAFE_INTEGER;
        const partes = String(registro.dataRelatorio).split("/");
        if (partes.length !== 3) return Number.MAX_SAFE_INTEGER;
        const dataHora = `${partes[2]}-${partes[1]}-${partes[0]}T${normalizarHora(registro.horaInicio || registro.horaEnvio || registro.hora)}`;
        const timestamp = new Date(dataHora).getTime();
        return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
    }

    function ordenarOcorrenciasPorDataHora(lista) {
        return [...lista].sort((a, b) => {
            const porData = timestampOcorrencia(a) - timestampOcorrencia(b);
            if (porData !== 0) return porData;
            return String(a.numRegistro || "").localeCompare(String(b.numRegistro || ""), "pt-BR", { numeric: true });
        });
    }

    function ordenarAgentesPorDataHora(lista) {
        return [...lista].sort((a, b) => timestampAgente(a) - timestampAgente(b));
    }

    const CONFIG_KPIS = [
        { key: 'TOTAL', label: 'Total Geral', colorClass: 'color-total' },
        { key: 'AGENTES', label: 'Agentes (Escalas)', colorClass: 'color-agentes' },
        { key: 'SINISTRO COM VÍTIMA', label: 'Sinistro C/ Vítima', colorClass: 'color-danger' },
        { key: 'SINISTRO COM VÍTIMA E/OU CRIME', label: 'Sinistro C/ Vítima e/ou Crime', colorClass: 'color-danger' },
        { key: 'SINISTRO SEM VÍTIMA', label: 'Sinistro S/ Vítima', colorClass: 'color-warning' },
        { key: 'ESTACIONAMENTO IRREGULAR', label: 'Estacionamento Irregular', colorClass: 'color-attention' },
        { key: 'FISCALIZAÇÃO EM TRANSPORTE', label: 'Fisc. Transporte', colorClass: 'color-grey' },
        { key: 'INTERVENÇÃO VIÁRIA', label: 'Intervenção Viária', colorClass: 'color-info' },
        { key: 'INTERVENÇÃO EM VIA', label: 'Intervenção em Via', colorClass: 'color-info' },
        { key: 'PANE SEMAFÓRICA', label: 'Pane Semafórica', colorClass: 'color-grey' },
        { key: 'VEÍCULO ABANDONADO', label: 'Veículo Abandonado', colorClass: 'color-grey' },
        { key: 'APOIO AO AGENTE', label: 'Apoio ao Agente', colorClass: 'color-support' }
    ];

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const docRef = doc(db, "usuarios", user.uid);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    const dados = docSnap.data();
                    const nomeDisplay = document.getElementById('nomeUsuarioDisplay');
                    if (nomeDisplay) nomeDisplay.innerText = "OLÁ, " + (dados.nome || "Usuário");
                    const isVisualizador = !temPermissaoModulo(dados, "estatisticas")
                        || ((dados.cargo === 'visualizador' || dados.nivel_acesso === 'leitura') && dados.cargo !== 'admin' && !temPermissaoModulo(dados, "estatisticas"));

                    if (isVisualizador) {
                        alert("⛔ ACESSO NEGADO: Você não tem permissão para ver estatísticas.");
                        window.location.href = "index.html"; 
                        return;
                    }

                    let tempoInatividade;
                    const resetarTimer = () => {
                        clearTimeout(tempoInatividade);
                        tempoInatividade = setTimeout(() => {
                            alert("Sessão encerrada por inatividade (15min).");
                            marcarOffline(user.uid).finally(() => {
                                signOut(auth).then(() => window.location.href = "login.html");
                            });
                        }, 15 * 60 * 1000);
                    };
                    window.onload = resetarTimer; document.onmousemove = resetarTimer; document.onclick = resetarTimer;
                    
                    carregarDadosDoBanco();
                } else {
                    alert("Erro de permissão.");
                    window.location.href = "login.html";
                }
            } catch (e) { 
                console.error(e); 
            }
        } else {
            window.location.href = "login.html";
        }
    });

    document.getElementById('btnSair').onclick = () => marcarOffline().finally(() => signOut(auth).then(() => window.location.href = "login.html"));

    async function carregarDadosDoBanco() {
        try {
            const [snapOcorrencias, snapAgentes] = await Promise.all([
                getDocs(query(collection(db, "ocorrencias_sttu"))),
                getDocs(query(collection(db, "historico_agentes")))
            ]);

            RAW_OCORRENCIAS = [];
            snapOcorrencias.forEach(doc => RAW_OCORRENCIAS.push(doc.data()));

            RAW_AGENTES = [];
            snapAgentes.forEach(doc => RAW_AGENTES.push(doc.data()));

            document.getElementById('loading').style.display = 'none';
            filtrarHoje();
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar dados: " + e.message);
        }
    }

    window.filtrarHoje = () => {
        const hoje = new Date().toISOString().split('T')[0];
        document.getElementById('filtroInicio').value = hoje;
        document.getElementById('filtroFim').value = hoje;
        aplicarFiltros(false);
    };

    window.filtrarEsteMes = () => {
        const hoje = new Date();
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); 
        document.getElementById('filtroInicio').value = primeiroDia.toISOString().split('T')[0];
        document.getElementById('filtroFim').value = ultimoDia.toISOString().split('T')[0];
        aplicarFiltros(false);
    };

    window.aplicarFiltros = (verTudo = false) => {
        const inicioStr = document.getElementById('filtroInicio').value;
        const fimStr = document.getElementById('filtroFim').value;

        let ocorrenciasFiltradas = [];
        let agentesFiltrados = [];

        if (verTudo) {
            ocorrenciasFiltradas = RAW_OCORRENCIAS;
            agentesFiltrados = RAW_AGENTES;
            document.getElementById('filtroInicio').value = "";
            document.getElementById('filtroFim').value = "";
        } else {
            if(!inicioStr || !fimStr) { alert("Selecione as datas ou clique em 'Ver Tudo'."); return; }
            const dtInicio = new Date(inicioStr + "T00:00:00");
            const dtFim = new Date(fimStr + "T23:59:59");

            ocorrenciasFiltradas = RAW_OCORRENCIAS.filter(d => {
                if(!d.data_filtro) return false;
                const dtObj = new Date(d.data_filtro + "T12:00:00"); 
                return dtObj >= dtInicio && dtObj <= dtFim;
            });

            agentesFiltrados = RAW_AGENTES.filter(d => {
                if(!d.dataRelatorio) return false;
                const parts = d.dataRelatorio.split('/');
                const dtObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T12:00:00`);
                return dtObj >= dtInicio && dtObj <= dtFim;
            });
        }

        window.OCORRENCIAS_FILTRADAS = ocorrenciasFiltradas;
        window.AGENTES_FILTRADOS = agentesFiltrados;
        
        processarDados(ocorrenciasFiltradas, agentesFiltrados);
    };

    document.getElementById('btnFiltrar').onclick = () => aplicarFiltros(false);
    document.getElementById('btnVerTudo').onclick = () => aplicarFiltros(true);
    document.getElementById('btnHoje').onclick = filtrarHoje;
    document.getElementById('btnMes').onclick = filtrarEsteMes;

    function processarDados(ocorrencias, agentes) {
        const dadosStatus = {};
        const dadosZonas = {};
        const dadosViaturas = {};
        const dadosAcidentesZona = {}; 
        const mapaDetalhes = {}; 
        const contagemPorTipo = {}; 

        CONFIG_KPIS.forEach(cfg => {
            if(cfg.key !== 'TOTAL' && cfg.key !== 'AGENTES') {
                contagemPorTipo[cfg.key] = 0;
            }
        });

        ocorrencias.forEach(d => {
            const status = d.situacao || "OUTROS";
            dadosStatus[status] = (dadosStatus[status] || 0) + 1;

            const tipoCru = d.ocorrencia || "NÃO INFORMADO";
            let tipoPrincipal = tipoCru.split('(')[0].trim();
            contagemPorTipo[tipoPrincipal] = (contagemPorTipo[tipoPrincipal] || 0) + 1;

            if (d.detalhamento) {
                if (!mapaDetalhes[tipoPrincipal]) mapaDetalhes[tipoPrincipal] = [];
                if (mapaDetalhes[tipoPrincipal].length < 5) {
                    let resumo = d.detalhamento.substring(0, 40); 
                    if (d.detalhamento.length > 40) resumo += "...";
                    mapaDetalhes[tipoPrincipal].push(`- ${resumo}`);
                }
            }

            const zona = d.zona || "N/I";
            dadosZonas[zona] = (dadosZonas[zona] || 0) + 1;

            if (!dadosAcidentesZona[zona]) dadosAcidentesZona[zona] = { com: 0, sem: 0 };
            
            if (tipoCru.includes("SINISTRO COM VÍTIMA")) {
                dadosAcidentesZona[zona].com++;
            } else if (tipoCru.includes("SINISTRO SEM VÍTIMA")) {
                dadosAcidentesZona[zona].sem++;
            }

            if (d.equipe) {
                const listaVtrs = d.equipe.split(',');
                listaVtrs.forEach(vtr => {
                    const vtrLimpa = vtr.trim().toUpperCase();
                    if (vtrLimpa.length > 2) dadosViaturas[vtrLimpa] = (dadosViaturas[vtrLimpa] || 0) + 1;
                });
            }
        });

        const statsAgentes = {}; 
        const mapaCondutores = {}; 

        agentes.forEach(d => {
            if (d.agente) {
                const linhas = d.agente.split('\n');
                const linhaCondutor = linhas.find(l => l.includes('(C)'));
                
                if (linhaCondutor) {
                    let nomeCondutor = linhaCondutor.replace('(C)', '').trim();
                    if (nomeCondutor.includes('-')) nomeCondutor = nomeCondutor.split('-')[0].trim();
                    if (!mapaCondutores[nomeCondutor]) mapaCondutores[nomeCondutor] = [];
                    const existe = mapaCondutores[nomeCondutor].some(item => item.v === d.veiculo && item.d === d.dataRelatorio);
                    if (!existe) {
                        mapaCondutores[nomeCondutor].push({ v: d.veiculo, d: d.dataRelatorio || "??/??/????", h: d.horaInicio || d.horaEnvio || "" });
                    }
                }

                linhas.forEach(linha => {
                    let nomeLimpo = linha.replace('(C)', '').trim();
                    if (nomeLimpo.includes('-')) nomeLimpo = nomeLimpo.split('-')[0].trim();
                    if (nomeLimpo.length > 3) {
                        if (!statsAgentes[nomeLimpo]) statsAgentes[nomeLimpo] = { qtd: 0, locais: [] };
                        statsAgentes[nomeLimpo].qtd++;
                        const novoLocal = `${d.zona || 'S/Z'} - ${d.pontoBase || 'S/LOCAL'}`;
                        const ultimosLocais = statsAgentes[nomeLimpo].locais;
                        if (ultimosLocais.length < 7) {
                            if (ultimosLocais.length === 0 || ultimosLocais[ultimosLocais.length - 1] !== novoLocal) {
                                ultimosLocais.push(novoLocal);
                            }
                        }
                    }
                });
            }
        });

        const kpiContainer = document.getElementById('kpiContainer');
        kpiContainer.innerHTML = ''; 

        CONFIG_KPIS.forEach(cfg => {
            let valor = 0;
            if (cfg.key === 'TOTAL') valor = ocorrencias.length;
            else if (cfg.key === 'AGENTES') valor = Object.keys(statsAgentes).length;
            else valor = contagemPorTipo[cfg.key] || 0;

            const div = document.createElement('div');
            div.className = 'kpi-box';
            div.innerHTML = `
                <div style="text-align:center;">
                    <span class="kpi-num ${cfg.colorClass}">${valor}</span>
                    <span class="kpi-label">${cfg.label}</span>
                </div>
                <button class="btn-kpi-pdf" onclick="baixarPdfKpi('${cfg.key}', '${cfg.label}')">⬇️ BAIXAR PDF</button>
            `;
            kpiContainer.appendChild(div);
        });

        renderizarTabelaCondutores(mapaCondutores);
        renderizarTabelaOcorrencias(ocorrencias); 
        gerarGraficoStatus(dadosStatus);
        gerarGraficoZonas(dadosZonas);
        gerarGraficoAcidentes(dadosAcidentesZona);
        gerarGraficoViaturas(dadosViaturas);
        gerarGraficoOcorrencias(contagemPorTipo, mapaDetalhes);
    }

    // --- FUNÇÃO: GERAR PDF DO KPI CLICADO ---
    window.baixarPdfKpi = async (kpiKey, kpiLabel) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        await adicionarEmblemaPdf(doc);
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`Relatório Analítico: ${kpiLabel}`, doc.internal.pageSize.width / 2, 20, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, doc.internal.pageSize.width / 2, 26, { align: "center" });
        
        let cabecalho = [];
        let corpo = [];
        
        if (kpiKey === 'AGENTES') {
            cabecalho = [['AGENTE(S)', 'VEÍCULO', 'DATA', 'ZONA', 'PONTO BASE', 'FUNÇÃO']];
            ordenarAgentesPorDataHora(window.AGENTES_FILTRADOS).forEach(a => {
                const linhas = a.agente ? a.agente.split('\n') : [];
                let nomes = linhas.map(l => {
                    let n = l.replace('(C)', '').trim();
                    return n.includes('-') ? n.split('-')[0].trim() : n;
                }).join(', ');
                
                corpo.push([
                    nomes || '-',
                    a.veiculo || '-',
                    a.dataRelatorio || '-',
                    a.zona || '-',
                    a.pontoBase || '-',
                    a.situacao || '-'
                ]);
            });
        } 
        else {
            cabecalho = [['Nº REG.', 'DATA/HORA', 'TIPO (OCORRÊNCIA)', 'LOCAL', 'ZONA', 'EQUIPE', 'SITUAÇÃO']];
            let listaAlvo = [];
            
            if (kpiKey === 'TOTAL') {
                listaAlvo = window.OCORRENCIAS_FILTRADAS;
            } else {
                listaAlvo = window.OCORRENCIAS_FILTRADAS.filter(o => {
                    const tipoPrincipal = (o.ocorrencia || "NÃO INFORMADO").split('(')[0].trim();
                    return tipoPrincipal === kpiKey;
                });
            }
            
            ordenarOcorrenciasPorDataHora(listaAlvo).forEach(o => {
                let dataExibicao = o.data_filtro ? o.data_filtro.split('-').reverse().join('/') : "-";
                if(o.horaEnvio) dataExibicao += `\n${o.horaEnvio}`;

                corpo.push([
                    o.numRegistro || '-',
                    dataExibicao,
                    o.ocorrencia || '-',
                    o.local || '-',
                    o.zona || '-',
                    o.equipe || '-',
                    o.situacao || '-'
                ]);
            });
        }
        
        if (corpo.length === 0) {
            alert(`Nenhum registro encontrado para a categoria: ${kpiLabel}`);
            return;
        }
        
        doc.autoTable({
            startY: 38,
            head: cabecalho,
            body: corpo,
            theme: 'grid',
            headStyles: { fillColor: [44, 62, 80] },
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' }
        });
        
        const nomeArquivo = `Listagem_${kpiLabel.replace(/[\s\/\\]+/g, '_')}.pdf`;
        doc.save(nomeArquivo);
    };

    // --- NOVA FUNÇÃO: BAIXAR PDF CONDUTORES ---
    window.baixarPdfCondutores = async () => {
        const tbody = document.getElementById('tbodyCondutores');
        if (tbody.rows.length === 0 || tbody.innerText.includes("Nenhum condutor")) {
            alert("Não há dados de condutores para exportar.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        await adicionarEmblemaPdf(doc, 14, 4, 18, 18);

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE PRODUTIVIDADE: CONDUTORES", 105, 15, { align: "center" });
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const inicio = document.getElementById('filtroInicio').value || 'Início';
        const fim = document.getElementById('filtroFim').value || 'Fim';
        doc.text(`Período: ${inicio} até ${fim}`, 14, 22);
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 27);

        const corpoTabela = [];
        const linhas = tbody.querySelectorAll('tr');
        
        linhas.forEach(linha => {
            const colunas = linha.querySelectorAll('td');
            if (colunas.length >= 3) {
                const nome = colunas[0].innerText.trim();
                const historico = colunas[1].innerText.replace(/\s+/g, ' ').trim(); 
                const total = colunas[2].innerText.trim();
                corpoTabela.push([nome, historico, total]);
            }
        });

        doc.autoTable({
            startY: 35,
            head: [['NOME DO CONDUTOR', 'HISTÓRICO DE VIATURAS E DATAS', 'TOTAL']],
            body: corpoTabela,
            theme: 'grid',
            headStyles: { fillColor: [39, 174, 96] },
            styles: { fontSize: 8, cellPadding: 3 },
            columnStyles: {
                0: { cellWidth: 40, fontStyle: 'bold' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 20, halign: 'center' }
            }
        });

        doc.save(`Relatorio_Condutores_${inicio}_a_${fim}.pdf`);
    };
    
    // Vinculando o botão de condutores
    document.getElementById('btnDownloadCondutores').onclick = window.baixarPdfCondutores;

    // --- FUNÇÃO PARA RENDERIZAR TABELA DE OCORRÊNCIAS ---
    function renderizarTabelaOcorrencias(lista) {
        const tbody = document.getElementById('tbodyOcorrencias');
        tbody.innerHTML = "";

        const listaOrdenada = ordenarOcorrenciasPorDataHora(lista);

        if (listaOrdenada.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Nenhuma ocorrência registrada no período.</td></tr>";
            return;
        }

        listaOrdenada.forEach((o) => {
            const globalIndex = window.OCORRENCIAS_FILTRADAS.indexOf(o);
            const tr = document.createElement('tr');
            const btnHtml = `<button class="btn-pdf-small" onclick="gerarPdfOcorrencia(${globalIndex})">📄 PDF</button>`;
            
            let dataExibicao = o.data_filtro ? o.data_filtro.split('-').reverse().join('/') : "-";
            if(o.horaEnvio) dataExibicao += `<br>${o.horaEnvio}`;

            tr.innerHTML = `
                <td><strong>${o.numRegistro || '-'}</strong></td>
                <td>${dataExibicao}</td>
                <td>${o.ocorrencia || '-'}</td>
                <td>${o.local || '-'}<br><small style="color:#7f8c8d;">${o.zona || ''}</small></td>
                <td>${o.situacao || '-'}</td>
                <td style="text-align:center;">${btnHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- FUNÇÃO PARA GERAR O PDF INDIVIDUAL ---
    window.gerarPdfOcorrencia = async (index) => {
        const o = window.OCORRENCIAS_FILTRADAS[index];
        if (!o) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        await adicionarEmblemaPdf(doc, 14, 4, 18, 18);
        
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("RELATÓRIO DE OCORRÊNCIA INDIVIDUAL", 105, 20, { align: "center" });
        
        doc.setDrawColor(200);
        doc.line(14, 25, 196, 25);
        doc.setFontSize(11);
        
        let startY = 35;
        const addLinha = (label, valor) => {
            doc.setFont("helvetica", "bold");
            doc.text(`${label}:`, 14, startY);
            doc.setFont("helvetica", "normal");
            const textoFormatado = valor ? String(valor) : "-";
            const linhasDeTexto = doc.splitTextToSize(textoFormatado, 140);
            doc.text(linhasDeTexto, 45, startY);
            startY += (linhasDeTexto.length * 6) + 2;
        };

        addLinha("Nº Registro", o.numRegistro);
        addLinha("Solicitante", o.solicitante);
        addLinha("Contato", o.contato);
        addLinha("Ocorrência", o.ocorrencia);
        addLinha("Local", o.local);
        addLinha("Detalhes", o.detalhamento);
        addLinha("Região/Zona", o.zona);
        addLinha("Equipe/VTR", o.equipe);
        addLinha("Situação", o.situacao);
        addLinha("Data do Fato", o.data_filtro ? o.data_filtro.split('-').reverse().join('/') : "-");
        addLinha("Hora Início", o.horaEnvio);
        addLinha("Hora Final", o.horaFinal);
        addLinha("Resultado", o.resultadoFinal);

        startY += 5;
        doc.line(14, startY - 5, 196, startY - 5);
        doc.setFont("helvetica", "bold");
        doc.text("HISTÓRICO DE LOGS:", 14, startY);
        startY += 7;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        
        let hist = "";
        if(o.horaEnvio) hist += `[${o.horaEnvio}] Registro Inicial do sistema.\n`;
        if (o.historicoLogs && Array.isArray(o.historicoLogs)) {
            hist += o.historicoLogs.map(l => String(l).replace(/[^\x20-\x7E\xA0-\xFF]/g, "")).join("\n");
        }
        if(!hist) hist = "Nenhum histórico registrado.";
        
        const histLines = doc.splitTextToSize(hist, 182);
        if (startY + (histLines.length * 5) > 280) {
            doc.addPage();
            startY = 20;
        }
        doc.text(histLines, 14, startY);
        doc.save(`Ocorrencia_${o.numRegistro || 'Avulsa'}.pdf`);
    };

    function renderizarTabelaCondutores(mapa) {
        const tbody = document.getElementById('tbodyCondutores');
        tbody.innerHTML = "";
        const nomesOrdenados = Object.keys(mapa).sort();

        if (nomesOrdenados.length === 0) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Nenhum condutor registrado neste período.</td></tr>";
            return;
        }

        nomesOrdenados.forEach(nome => {
            const listaConducoes = mapa[nome];
            listaConducoes.sort((a, b) => {
                 const dataA = timestampAgente({ dataRelatorio: a.d, horaInicio: a.h });
                 const dataB = timestampAgente({ dataRelatorio: b.d, horaInicio: b.h });
                 return dataA - dataB; 
            });

            const veiculosHTML = listaConducoes.map(item => 
                `<span class="veiculo-tag">${item.v} <span class="tag-data">(${item.d.substring(0,5)}${item.h ? ` ${item.h}` : ""})</span></span>`
            ).join(" ");

            const tr = document.createElement('tr');
            tr.innerHTML = `<td><strong>${nome}</strong></td><td>${veiculosHTML}</td><td style="text-align:center;">${listaConducoes.length}</td>`;
            tbody.appendChild(tr);
        });
    }

    function criarChart(id, config) {
        if (charts[id]) charts[id].destroy(); 
        charts[id] = new Chart(document.getElementById(id), config);
    }

    function gerarGraficoOcorrencias(dados, detalhesMap) {
        const sorted = Object.entries(dados).sort((a,b) => b[1] - a[1]);
        criarChart('chartOcorrencias', {
            type: 'bar',
            indexAxis: 'y', 
            data: {
                labels: sorted.map(i => i[0]),
                datasets: [{ label: 'Quantidade', data: sorted.map(i => i[1]), backgroundColor: '#8e44ad', borderRadius: 4 }]
            },
            options: {
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterBody: function(context) {
                                const label = context[0].label;
                                const detalhes = detalhesMap[label];
                                if (detalhes && detalhes.length > 0) return "\nÚltimos detalhes:\n" + detalhes.join('\n');
                                return "";
                            }
                        }
                    }
                }
            }
        });
    }

    function gerarGraficoStatus(dados) {
        criarChart('chartStatus', {
            type: 'doughnut',
            data: {
                labels: Object.keys(dados),
                datasets: [{ data: Object.values(dados), backgroundColor: ['#27ae60', '#e67e22', '#c0392b', '#95a5a6', '#f39c12'] }]
            }
        });
    }

    function gerarGraficoZonas(dados) {
        const labels = Object.keys(dados).sort();
        criarChart('chartZonas', {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{ label: 'Qtd', data: labels.map(l => dados[l]), backgroundColor: '#34495e', borderRadius: 4 }]
            },
            options: { plugins: { legend: { display: false } } }
        });
    }

    function gerarGraficoAcidentes(dadosComplexos) {
        const zonas = Object.keys(dadosComplexos).sort().filter(z => dadosComplexos[z].com > 0 || dadosComplexos[z].sem > 0);
        criarChart('chartAcidentes', {
            type: 'bar',
            data: {
                labels: zonas,
                datasets: [
                    { label: 'C/ VÍTIMA', data: zonas.map(z => dadosComplexos[z].com), backgroundColor: '#c0392b' },
                    { label: 'S/ VÍTIMA', data: zonas.map(z => dadosComplexos[z].sem), backgroundColor: '#f39c12' }
                ]
            },
            options: { scales: { x: { stacked: true }, y: { stacked: true } } }
        });
    }

    function gerarGraficoViaturas(dados) {
        const sorted = Object.entries(dados).sort((a,b) => b[1] - a[1]).slice(0, 15);
        criarChart('chartViaturas', {
            type: 'bar',
            data: {
                labels: sorted.map(i => i[0]),
                datasets: [{ label: 'Acionamentos', data: sorted.map(i => i[1]), backgroundColor: '#2980b9', borderRadius: 3 }]
            }
        });
    }
}

iniciarEstatisticas().catch((error) => {
    console.error("Erro ao carregar estatisticas:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexão e atualize a página.");
});


