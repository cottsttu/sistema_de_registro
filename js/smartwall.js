async function iniciarSmartwall() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js");
    const { getFirestore, collection, doc, getDoc, query, onSnapshot, where } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js");

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

    const STATUS_CONCLUIDOS = new Set(["CONCLU\u00cdDA", "CONCLUIDA", "N\u00c3O ATENDIDA", "NAO ATENDIDA"]);
    const STATUS_PAINEL_PENDENTES = ["ENCAMINHADA", "EM ANDAMENTO", "N\u00c3O ATENDIDA", "PARA O DESPACHO", "PARA O PR\u00d3XIMO TURNO"];
    const STATUS_DESPACHO = new Set(["PARA O DESPACHO"]);
    const STATUS_EM_ANDAMENTO = new Set(["ENCAMINHADA", "EM ANDAMENTO"]);
    const STATUS_ATIVOS_SMARTWALL = new Set([...STATUS_DESPACHO, ...STATUS_EM_ANDAMENTO]);
    const regioesBase = ["GERAL", "REGI\u00c3O 1", "REGI\u00c3O 2", "REGI\u00c3O 3", "REGI\u00c3O 4", "REGI\u00c3O 5"];
    const coresRegiao = ["#67479a", "#3b364c", "#e4f001", "#64ec02", "#096acc", "#d30000"];
    const coresRegiaoVt = ["#8060b2", "#554e6c", "#f2ff3b", "#80ff28", "#2387e8", "#ff2a2a"];
    const coresRegiaoMt = ["#4b3274", "#292639", "#aab300", "#43aa00", "#064a91", "#8f0000"];
    const coresTipo = ["#2f86ff", "#ffbd1a", "#64d637", "#ff4c5d", "#9d55ff"];
    const mtIconImg = new Image();
    const vtIconImg = new Image();
    mtIconImg.src = "src/mt_png.png";
    vtIconImg.src = "src/vt_png.png";

    let myChartRegioes = null;
    let myChartTipos = null;
    const ocorrenciasModal = new Map();
    const kpiValoresAnteriores = {
        total: null,
        andamento: null,
        concluidas: null,
        frota: null,
        despacho: null,
        encaminhada: null,
        concluidaStatus: null,
        encaminhadas: new Set(),
        listaInicializada: false
    };

    Chart.defaults.color = "#d6e4f4";
    Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    Chart.defaults.font.weight = "700";
    Chart.defaults.animation = false;

    function atualizarTemaGraficos() {
        if (myChartRegioes) {
            const dataset = myChartRegioes.data.datasets[0];
            if (dataset) {
                dataset.borderColor = document.body.dataset.theme === "day" ? "#ffffff" : "rgba(255, 255, 255, 0.82)";
            }
            myChartRegioes.update("none");
        }

        if (myChartTipos) {
            myChartTipos.update("none");
        }
    }

    window.addEventListener("sttu-theme-change", atualizarTemaGraficos);

    function getDataHojeISO() {
        const hoje = new Date();
        return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    }

    function getDataHojeBR() {
        const hoje = new Date();
        return `${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`;
    }

    const dataFiltro = getDataHojeISO();
    const dataRelatorioFiltro = getDataHojeBR();

    function normalizarTexto(valor) {
        return String(valor || "").trim().toUpperCase();
    }

    function isConcluida(ocorrencia) {
        return STATUS_CONCLUIDOS.has(normalizarTexto(ocorrencia?.situacao));
    }

    function isAtivaNoPainelPendentes(ocorrencia) {
        return STATUS_ATIVOS_SMARTWALL.has(normalizarTexto(ocorrencia?.situacao));
    }

    function escapeHtml(valor) {
        return String(valor ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function getTimestamp(ocorrencia) {
        if (ocorrencia?.timestamp?.seconds) return ocorrencia.timestamp.seconds;
        if (ocorrencia?.criadoEm?.seconds) return ocorrencia.criadoEm.seconds;
        return 0;
    }

    function getHoraMinutos(hora) {
        const match = String(hora || "").match(/^(\d{1,2}):(\d{2})/);
        if (!match) return -1;
        return Number(match[1]) * 60 + Number(match[2]);
    }

    function formatarHoraComSegundos(hora) {
        const match = String(hora || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return "--:--:--";
        const horas = match[1].padStart(2, "0");
        const minutos = match[2].padStart(2, "0");
        const segundos = (match[3] || "00").padStart(2, "0");
        return `${horas}:${minutos}:${segundos}`;
    }

    function ordenarRecentes(a, b) {
        const timestampDiff = getTimestamp(b) - getTimestamp(a);
        if (timestampDiff) return timestampDiff;
        return getHoraMinutos(b.horaEnvio) - getHoraMinutos(a.horaEnvio);
    }

    function atualizarRelogio() {
        const agora = new Date();
        const relogio = document.getElementById("relogio");
        const dataAtual = document.getElementById("dataAtual");

        if (relogio) relogio.innerText = agora.toLocaleTimeString("pt-BR");
        if (dataAtual) {
            dataAtual.innerText = agora.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric"
            });
        }
    }

    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);

    function agendarAtualizacaoMeiaNoite() {
        const agora = new Date();
        const proximaMeiaNoite = new Date(agora);
        proximaMeiaNoite.setDate(proximaMeiaNoite.getDate() + 1);
        proximaMeiaNoite.setHours(0, 0, 0, 0);

        const tempoAteMeiaNoite = proximaMeiaNoite.getTime() - agora.getTime();
        setTimeout(() => {
            window.location.reload();
        }, tempoAteMeiaNoite);
    }

    agendarAtualizacaoMeiaNoite();

    function calcularTempoAberto(horaEnvio) {
        if (!horaEnvio || !horaEnvio.includes(":")) return "Tempo desconhecido";

        const agora = new Date();
        const [horas, minutos] = horaEnvio.split(":").map(Number);
        const envio = new Date();
        envio.setHours(horas, minutos, 0, 0);

        let diffMs = agora - envio;
        if (diffMs < 0) {
            envio.setDate(envio.getDate() - 1);
            diffMs = agora - envio;
        }

        const diffMinutos = Math.floor(diffMs / 60000);
        const h = Math.floor(diffMinutos / 60);
        const m = diffMinutos % 60;

        if (h > 0) return `Aberta ha ${h}h e ${m}m`;
        return `Aberta ha ${m} minutos`;
    }

    function getTipoBase(ocorrencia) {
        return String(ocorrencia?.ocorrencia || "Sem natureza").split(" (")[0].trim() || "Sem natureza";
    }

    function getZona(ocorrencia) {
        return normalizarTexto(ocorrencia?.zona || ocorrencia?.regiao || "SEM REGI\u00c3O");
    }

    function atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes) {
        const mapaUnico = new Map();
        docsPendentes.forEach((item) => mapaUnico.set(item.id, item));
        docsHoje.forEach((item) => mapaUnico.set(item.id, item));

        const todas = Array.from(mapaUnico.values());
        const hoje = todas.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro);
        const ativas = todas.filter(isAtivaNoPainelPendentes).sort(ordenarRecentes);
        const ativasHoje = ativas.filter((ocorrencia) => ocorrencia.data_filtro === dataFiltro);
        const concluidasHoje = hoje.filter(isConcluida);
        const qtdDespacho = ativas.filter((ocorrencia) => STATUS_DESPACHO.has(normalizarTexto(ocorrencia.situacao))).length;
        const qtdAndamento = ativas.filter((ocorrencia) => STATUS_EM_ANDAMENTO.has(normalizarTexto(ocorrencia.situacao))).length;

        const contagemRegiaoAtivas = Object.fromEntries(regioesBase.map((regiao) => [regiao, 0]));
        const contagemRegiaoHistorico = Object.fromEntries(regioesBase.map((regiao) => [regiao, 0]));
        const contagemTipo = {};
        const frotaAtiva = calcularFrotaAtiva(docsAtivosAgentes);
        const frotaAtivaPorRegiao = calcularFrotaPorRegiao(docsAtivosAgentes);
        const frotaHistoricoPorRegiao = calcularFrotaPorRegiao(docsHistoricoAgentes);

        hoje.forEach((ocorrencia) => {
            const tipoBase = getTipoBase(ocorrencia);
            contagemTipo[tipoBase] = (contagemTipo[tipoBase] || 0) + 1;
        });

        docsHistoricoAgentes.forEach((registro) => {
            const zona = getZona(registro);
            if (contagemRegiaoHistorico[zona] !== undefined) {
                contagemRegiaoHistorico[zona]++;
            }
        });

        ativas.forEach((ocorrencia) => {
            const zona = getZona(ocorrencia);
            if (contagemRegiaoAtivas[zona] !== undefined) {
                contagemRegiaoAtivas[zona]++;
            }
        });

        atualizarKpiNumero("kpiTotal", concluidasHoje.length + ativas.length, "total", null, null);
        atualizarKpiNumero("kpiDespacho", qtdDespacho, "despacho", "despacho", qtdDespacho, true);
        atualizarKpiNumero("kpiAndamento", qtdAndamento, "andamento", "encaminhada", qtdAndamento, true);
        atualizarKpiNumero("kpiConcluidas", concluidasHoje.length, "concluidas", "concluidaStatus", concluidasHoje.length, true);
        document.getElementById("kpiVtrs").innerHTML = `
            <span class="fleet-value fleet-mt"><img class="fleet-icon" src="src/mt_png.png" alt="MT"><span class="fleet-count">${frotaAtiva.mt}</span></span>
            <span class="fleet-value fleet-vt"><img class="fleet-icon" src="src/vt_png.png" alt="VT"><span class="fleet-count">${frotaAtiva.vt}</span></span>
        `;
        atualizarKpiFrota(frotaAtiva);
        atualizarResumoAtendimento(ativas.length);

        atualizarListaAtivas(ativasHoje);
        atualizarGraficos(contagemRegiaoAtivas, contagemRegiaoHistorico, contagemTipo, frotaAtivaPorRegiao, frotaHistoricoPorRegiao);
    }

    function atualizarKpiNumero(id, valor, chave, chaveAlerta = chave, valorAlerta = valor, alertarSomenteAumento = false) {
        const elemento = document.getElementById(id);
        if (!elemento) return;

        const anterior = kpiValoresAnteriores[chave];
        const anteriorAlerta = kpiValoresAnteriores[chaveAlerta];
        elemento.innerText = valor;
        const deveAlertar = chaveAlerta &&
            anteriorAlerta !== null &&
            anteriorAlerta !== valorAlerta &&
            (!alertarSomenteAumento || valorAlerta > anteriorAlerta);
        if (deveAlertar) {
            const card = elemento.closest(".kpi-card");
            if (card) {
                card.classList.remove("kpi-alert");
                void card.offsetWidth;
                card.classList.add("kpi-alert");
                setTimeout(() => card.classList.remove("kpi-alert"), 10000);
            }
        }
        kpiValoresAnteriores[chave] = valor;
        if (chaveAlerta) kpiValoresAnteriores[chaveAlerta] = valorAlerta;
    }

    function atualizarKpiFrota(frotaAtiva) {
        const assinatura = `${frotaAtiva.mt}-${frotaAtiva.vt}`;
        const anterior = kpiValoresAnteriores.frota;
        const [mtAnterior = 0, vtAnterior = 0] = String(anterior || "0-0").split("-").map(Number);
        if (anterior !== null) {
            const card = document.getElementById("kpiVtrsCard");
            if (frotaAtiva.mt !== mtAnterior) acionarPiscaFleet(card?.querySelector(".fleet-mt .fleet-icon"));
            if (frotaAtiva.vt !== vtAnterior) acionarPiscaFleet(card?.querySelector(".fleet-vt .fleet-icon"));
        }
        kpiValoresAnteriores.frota = assinatura;
    }

    function acionarPiscaFleet(icon) {
        if (!icon) return;
        icon.classList.remove("fleet-icon-alert");
        void icon.offsetWidth;
        icon.classList.add("fleet-icon-alert");
        setTimeout(() => icon.classList.remove("fleet-icon-alert"), 10000);
    }

    function atualizarResumoAtendimento(total) {
        const bloco = document.getElementById("activeLiveSummary");
        if (!bloco) return;
        const numero = bloco.querySelector("strong");
        if (numero) numero.textContent = String(total);
    }

    function calcularFrotaAtiva(docsAtivosAgentes) {
        return docsAtivosAgentes.reduce((acc, item) => {
            const veiculo = normalizarTexto(item?.veiculo);
            if (veiculo.startsWith("MT")) acc.mt += 1;
            if (veiculo.startsWith("VT")) acc.vt += 1;
            return acc;
        }, { mt: 0, vt: 0 });
    }

    function calcularFrotaPorRegiao(docsAtivosAgentes) {
        const base = Object.fromEntries(regioesBase.map((regiao) => [regiao, { mt: 0, vt: 0 }]));

        docsAtivosAgentes.forEach((item) => {
            const veiculo = normalizarTexto(item?.veiculo);
            const zona = getZona(item);
            if (!base[zona]) return;
            if (veiculo.startsWith("MT")) base[zona].mt += 1;
            if (veiculo.startsWith("VT")) base[zona].vt += 1;
        });

        return base;
    }

    function atualizarListaAtivas(ativas) {
        const divLista = document.getElementById("listaAtivas");
        if (!divLista) return;

        divLista.innerHTML = "";
        ocorrenciasModal.clear();

        if (ativas.length === 0) {
            divLista.innerHTML = '<div class="empty-state">Nenhuma ocorrencia ativa registrada hoje.</div>';
            kpiValoresAnteriores.listaInicializada = true;
            return;
        }

        const ativasOrdenadas = [...ativas].sort((a, b) => getHoraMinutos(b.horaEnvio) - getHoraMinutos(a.horaEnvio));

        ativasOrdenadas.slice(0, 8).forEach((ocorrencia) => {
            const situacao = normalizarTexto(ocorrencia.situacao);
            const statusClass = STATUS_DESPACHO.has(situacao) ? "despacho" :
                STATUS_EM_ANDAMENTO.has(situacao) ? "encaminhada" :
                isConcluida(ocorrencia) ? "concluida" : "";
            const modalId = ocorrencia.id || String(ocorrenciasModal.size);
            ocorrenciasModal.set(modalId, ocorrencia);
            const alertaEncaminhada = kpiValoresAnteriores.listaInicializada &&
                statusClass === "encaminhada" &&
                !kpiValoresAnteriores.encaminhadas.has(modalId);
            if (statusClass === "encaminhada") kpiValoresAnteriores.encaminhadas.add(modalId);
            const horaEnvio = formatarHoraComSegundos(ocorrencia.horaEnvio);

            divLista.insertAdjacentHTML("beforeend", `
                <button type="button" class="list-item ${statusClass} ${alertaEncaminhada ? "list-alert" : ""}" data-modal-id="${escapeHtml(modalId)}">
                    <span class="status-dot" aria-hidden="true"></span>
                    <span class="item-hora">${escapeHtml(horaEnvio)}</span>
                    <span class="item-tipo">${escapeHtml(ocorrencia.ocorrencia || "Sem natureza")}</span>
                </button>
            `);
        });

        kpiValoresAnteriores.listaInicializada = true;
    }

    function abrirModalRegistro(ocorrencia) {
        const modal = document.getElementById("smartRegistroModal");
        const content = document.getElementById("smartModalContent");
        if (!modal || !content || !ocorrencia) return;

        const campos = [
            ["Nº Registro", ocorrencia.numRegistro || ocorrencia.numeroRegistro || "-"],
            ["Situação", ocorrencia.situacao || "-"],
            ["Ocorrência", ocorrencia.ocorrencia || "-"],
            ["Região", getZona(ocorrencia)],
            ["Hora envio", formatarHoraComSegundos(ocorrencia.horaEnvio)],
            ["Tempo aberto", calcularTempoAberto(ocorrencia.horaEnvio)],
            ["Equipe(s)", ocorrencia.equipe || "-"],
            ["Local", ocorrencia.local || "-"],
            ["Detalhe", ocorrencia.detalhamento || ocorrencia.detalhe || "-"]
        ];

        campos[0][0] = "N\u00ba Registro";
        campos[1][0] = "Situa\u00e7\u00e3o";
        campos[2][0] = "Ocorr\u00eancia";
        campos[3][0] = "Regi\u00e3o";

        content.innerHTML = campos.map(([label, valor]) => `
            <div class="smart-modal-field">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(valor)}</span>
            </div>
        `).join("");

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
    }

    function fecharModalRegistro() {
        const modal = document.getElementById("smartRegistroModal");
        if (!modal) return;
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
    }

    document.addEventListener("click", (event) => {
        const item = event.target.closest(".list-item[data-modal-id]");
        if (item) {
            abrirModalRegistro(ocorrenciasModal.get(item.dataset.modalId));
            return;
        }

        if (event.target.closest("[data-close-smart-modal]")) {
            fecharModalRegistro();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") fecharModalRegistro();
    });

    function atualizarGraficos(dadosRegiaoAtivas, dadosRegiaoHoje, dadosTipo, frotaAtivaPorRegiao, frotaHistoricoPorRegiao) {
        atualizarGraficoRegioes(dadosRegiaoAtivas, dadosRegiaoHoje, frotaAtivaPorRegiao, frotaHistoricoPorRegiao);
        atualizarGraficoTipos(dadosTipo);
    }

    function atualizarGraficoRegioes(dadosRegiaoAtivas, dadosRegiaoHoje, frotaAtivaPorRegiao, frotaHistoricoPorRegiao) {
        const canvas = document.getElementById("chartRegioes");
        if (!canvas) return;

        const labelsResumo = regioesBase;
        const totaisPorRegiao = labelsResumo.map((regiao) => {
            const frota = frotaHistoricoPorRegiao[regiao] || { mt: 0, vt: 0 };
            return (frota.mt || 0) + (frota.vt || 0);
        });
        const temDadosRegiao = totaisPorRegiao.some((valor) => valor > 0);
        const datasetData = temDadosRegiao ? totaisPorRegiao : [1];
        const datasetColors = temDadosRegiao ? coresRegiao : ["rgba(255, 255, 255, 0.16)"];
        const totalGeral = totaisPorRegiao.reduce((acc, valor) => acc + valor, 0);
        const totalMt = labelsResumo.reduce((acc, regiao) => acc + (frotaHistoricoPorRegiao[regiao]?.mt || 0), 0);
        const totalVt = labelsResumo.reduce((acc, regiao) => acc + (frotaHistoricoPorRegiao[regiao]?.vt || 0), 0);
        const ctxRegioes = canvas.getContext("2d");
        if (myChartRegioes) myChartRegioes.destroy();
        renderizarRankingGraficoRegiao(labelsResumo, frotaAtivaPorRegiao);

        const labelsDonutRegiaoPlugin = {
            id: "labelsDonutRegiaoSmartwall",
            afterDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                if (!meta?.data?.length) return;
                const { ctx } = chart;
                const centerX = meta.data[0].x;
                const centerY = meta.data[0].y;
                const temaDia = document.body.dataset.theme === "day";
                const corTexto = temaDia ? "#ffffff" : "#142535";
                const corSecundaria = corTexto;
                ctx.save();
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "transparent";
                ctx.shadowBlur = 0;
                ctx.fillStyle = corTexto;
                ctx.font = "900 10px Segoe UI, sans-serif";
                ctx.fillText("TOTAL GERAL", centerX, centerY - 48);

                const iconY = centerY - 28;
                const iconSize = 24;
                ctx.filter = temaDia ? "brightness(0) invert(1)" : "brightness(0)";
                if (mtIconImg.complete) ctx.drawImage(mtIconImg, centerX - 54, iconY - 10, iconSize, iconSize);
                if (vtIconImg.complete) ctx.drawImage(vtIconImg, centerX + 30, iconY - 10, iconSize, iconSize);
                ctx.filter = "none";
                ctx.font = "950 24px Segoe UI, sans-serif";
                ctx.fillStyle = corTexto;
                ctx.fillText(String(totalMt), centerX - 42, centerY + 4);
                ctx.fillText(String(totalVt), centerX + 42, centerY + 4);
                ctx.strokeStyle = temaDia ? "rgba(15, 31, 54, 0.15)" : "rgba(255, 255, 255, 0.18)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX - 58, centerY + 25);
                ctx.lineTo(centerX + 58, centerY + 25);
                ctx.stroke();
                ctx.fillStyle = corSecundaria;
                ctx.font = "900 10px Segoe UI, sans-serif";
                ctx.fillText("TOTAL", centerX, centerY + 41);
                ctx.fillStyle = corTexto;
                ctx.font = "950 24px Segoe UI, sans-serif";
                ctx.fillText(String(totalGeral), centerX, centerY + 63);

                meta.data.forEach((arc, index) => {
                    const valor = chart.data.datasets[0].data[index] || 0;
                    if (!valor) return;
                    const regiao = chart.data.labels[index];
                    const frota = frotaHistoricoPorRegiao[regiao] || { mt: 0, vt: 0 };
                    const percentual = totalGeral ? ((valor / totalGeral) * 100).toFixed(1).replace(".", ",") : "0,0";
                    const pos = arc.tooltipPosition();
                    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
                    ctx.shadowBlur = 4;
                    ctx.fillStyle = "#ffffff";
                    ctx.font = "950 13px Segoe UI, sans-serif";
                    ctx.fillText(`${percentual}%`, pos.x, pos.y - 18);
                    ctx.font = "900 11px Segoe UI, sans-serif";
                    ctx.fillText(`Total ${valor}`, pos.x, pos.y);
                    ctx.filter = "brightness(0) invert(1)";
                    if (vtIconImg.complete) ctx.drawImage(vtIconImg, pos.x - 34, pos.y + 10, 14, 14);
                    if (mtIconImg.complete) ctx.drawImage(mtIconImg, pos.x + 8, pos.y + 10, 14, 14);
                    ctx.filter = "none";
                    ctx.font = "950 11px Segoe UI, sans-serif";
                    ctx.fillText(String(frota.vt || 0), pos.x - 12, pos.y + 18);
                    ctx.fillText(String(frota.mt || 0), pos.x + 30, pos.y + 18);
                });
                ctx.restore();
            }
        };

        myChartRegioes = new Chart(ctxRegioes, {
            type: "doughnut",
            data: {
                labels: labelsResumo,
                datasets: [{
                    data: datasetData,
                    backgroundColor: datasetColors,
                    borderColor: document.body.dataset.theme === "day" ? "#ffffff" : "rgba(255, 255, 255, 0.82)",
                    borderWidth: 2,
                    hoverOffset: 5,
                    spacing: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                cutout: "46%",
                layout: {
                    padding: { left: 18, right: 18, top: 18, bottom: 18 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const valor = context.raw || 0;
                                const regiao = context.label;
                                const frota = frotaHistoricoPorRegiao[regiao] || { mt: 0, vt: 0 };
                                const percentual = totalGeral ? ((valor / totalGeral) * 100).toFixed(1).replace(".", ",") : "0,0";
                                return `${regiao}: ${valor} (${percentual}%) | Moto ${frota.mt || 0} | Viatura ${frota.vt || 0}`;
                            }
                        }
                    }
                }
            },
            plugins: [labelsDonutRegiaoPlugin]
        });
    }

    function renderizarRankingGraficoRegiao(labels, frotaPorRegiao) {
        const legend = document.getElementById("regionRankingPanel");
        if (!legend) return;
        const linhas = labels.map((regiao, index) => {
            const frota = frotaPorRegiao[regiao] || { mt: 0, vt: 0 };
            const total = (frota.mt || 0) + (frota.vt || 0);
            return {
                regiao,
                total,
                mt: frota.mt || 0,
                vt: frota.vt || 0,
                cor: coresRegiao[index] || "#2f86ff"
            };
        }).sort((a, b) => b.total - a.total || a.regiao.localeCompare(b.regiao, "pt-BR"));
        const totalGeral = linhas.reduce((acc, item) => acc + item.total, 0);
        linhas.forEach((item) => {
            item.percentual = totalGeral ? ((item.total / totalGeral) * 100).toFixed(1).replace(".", ",") : "0,0";
        });

        legend.innerHTML = `
            <div class="region-ranking-title">
                <span>viaturas em atendimento</span>
                <img src="src/live_png.png" alt="Ao vivo">
            </div>
            <div class="region-ranking-head">
                <span>Região</span>
                <span>Total / %</span>
            </div>
            <div class="region-ranking-list">
                ${linhas.map((item, index) => `
                    <div class="region-ranking-row" style="--legend-color: ${item.cor}">
                        <span class="region-rank-wrap"><strong class="region-rank">${index + 1}</strong></span>
                        <span class="region-info">
                            <strong class="region-name">${escapeHtml(item.regiao)}</strong>
                            <span class="region-fleet-counts">
                                <span><img src="src/mt_png.png" alt="Moto"> ${item.mt}</span>
                                <i aria-hidden="true"></i>
                                <span><img src="src/vt_png.png" alt="Viatura"> ${item.vt}</span>
                            </span>
                        </span>
                        <span class="region-metric">
                            <strong class="region-total">${item.total}</strong>
                            <strong class="region-percent">${item.percentual}%</strong>
                        </span>
                    </div>
                `).join("")}
            </div>
            <div class="region-ranking-total">
                <span>Total geral</span>
                <strong>${totalGeral}</strong>
                <strong>${totalGeral ? "100%" : "0%"}</strong>
            </div>
        `;
    }

    function atualizarTotalCentro(canvas) {
        const container = canvas.closest(".canvas-container");
        if (!container) return;

        let centro = container.querySelector(".chart-total-center");
        if (!centro) {
            centro = document.createElement("div");
            centro.className = "chart-total-center";
            container.appendChild(centro);
        }
        centro.innerHTML = "";
    }

    function atualizarGraficoTipos(dadosTipo) {
        const canvas = document.getElementById("chartTipos");
        if (!canvas) return;

        const tiposOrdenados = Object.entries(dadosTipo)
            .filter(([, qtd]) => qtd > 0)
            .sort((a, b) => b[1] - a[1]);
        const total = tiposOrdenados.reduce((acc, [, qtd]) => acc + qtd, 0);
        renderizarResumoTipo(tiposOrdenados, total);

        const ctxTipos = canvas.getContext("2d");
        if (myChartTipos) myChartTipos.destroy();

        const maiorTipo = tiposOrdenados.reduce((max, [, qtd]) => Math.max(max, qtd), 0);
        ctxTipos.font = "800 11px Segoe UI, sans-serif";
        const maiorNomeTipo = tiposOrdenados.reduce((max, [tipo]) => Math.max(max, ctxTipos.measureText(String(tipo).toUpperCase()).width), 0);
        const larguraCanvasTipo = Math.max(320, canvas.clientWidth || canvas.width || 320);
        const reservaRotuloTipo = Math.min(0.62, Math.max(0.28, (maiorNomeTipo + 72) / larguraCanvasTipo));
        const escalaMaximaTipo = Math.max(1, Math.ceil(maiorTipo / (1 - reservaRotuloTipo)));
        const labelBarrasPlugin = {
            id: "labelBarrasSmartwall",
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                const xScale = scales.x;
                const yScale = scales.y;
                const dataset = chart.data.datasets[0];
                const canvasRight = chart.width - 8;
                const outsideGap = 10;
                const insideGap = 14;
                const temaDia = document.body.dataset.theme === "day";
                const corDentro = temaDia ? "#000000" : "#ffffff";
                const corFora = temaDia ? "#06131f" : "#e8f4ff";
                const isLargeScreen = window.matchMedia("(min-width: 1518px)").matches;
                const tamanhoLabelBase = isLargeScreen ? 18 : 11;
                const tamanhoValorBase = isLargeScreen ? 24 : 16;

                const ajustarFonte = (texto, peso, tamanhoBase, larguraMaxima) => {
                    let tamanho = tamanhoBase;
                    do {
                        ctx.font = `${peso} ${tamanho}px Segoe UI, sans-serif`;
                        if (ctx.measureText(texto).width <= larguraMaxima || tamanho <= 6) break;
                        tamanho -= 1;
                    } while (tamanho > 6);
                    return tamanho;
                };

                ctx.save();
                ctx.textBaseline = "middle";
                chart.data.labels.forEach((label, index) => {
                    const valor = dataset.data[index] || 0;
                    const textoLabel = String(label).toUpperCase();
                    const textoValor = String(valor);
                    const y = yScale.getPixelForValue(index);
                    const xBarraInicio = xScale.getPixelForValue(0);
                    const xBarraFim = xScale.getPixelForValue(valor);
                    const larguraBarra = Math.max(0, xBarraFim - xBarraInicio);
                    ctx.font = `800 ${tamanhoLabelBase}px Segoe UI, sans-serif`;
                    const larguraLabel = ctx.measureText(textoLabel).width;
                    ctx.font = `900 ${tamanhoValorBase}px Segoe UI, sans-serif`;
                    const larguraValor = ctx.measureText(textoValor).width;
                    const cabeDentro = larguraBarra >= Math.max(larguraLabel, larguraValor) + (insideGap * 2);

                    if (cabeDentro) {
                        const xCentro = Math.max(chartArea.left + insideGap, Math.min(xBarraFim - insideGap, (xBarraInicio + xBarraFim) / 2));
                        ctx.textAlign = "center";
                        ctx.font = `800 ${tamanhoLabelBase}px Segoe UI, sans-serif`;
                        ctx.fillStyle = corDentro;
                        ctx.fillText(textoLabel, xCentro, y - 8);

                        ctx.font = `900 ${tamanhoValorBase}px Segoe UI, sans-serif`;
                        ctx.fillStyle = corDentro;
                        ctx.fillText(textoValor, xCentro, y + 12);
                        return;
                    }

                    const xFora = Math.min(xBarraFim + outsideGap, canvasRight - 12);
                    const larguraFora = Math.max(52, canvasRight - xFora);
                    ctx.textAlign = "left";
                    ajustarFonte(textoLabel, 800, tamanhoLabelBase, larguraFora);
                    ctx.fillStyle = corFora;
                    ctx.fillText(textoLabel, xFora, y - 8);

                    ajustarFonte(textoValor, 900, tamanhoValorBase, larguraFora);
                    ctx.fillStyle = corFora;
                    ctx.fillText(textoValor, xFora, y + 12);
                });
                ctx.restore();
            }
        };

        myChartTipos = new Chart(ctxTipos, {
            type: "bar",
            data: {
                labels: tiposOrdenados.map((tipo) => tipo[0]),
                datasets: [{
                    label: "Ocorrencias",
                    data: tiposOrdenados.map((tipo) => tipo[1]),
                    backgroundColor: tiposOrdenados.map((_, index) => coresTipo[index] || coresTipo[0]),
                    borderColor: tiposOrdenados.map((_, index) => coresTipo[index] || coresTipo[0]),
                    borderWidth: 1,
                    borderRadius: 6,
                    barThickness: Math.max(24, Math.min(42, 240 / Math.max(1, tiposOrdenados.length)))
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                layout: {
                    padding: { left: 0, right: 34, top: 12, bottom: 4 }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.raw} ocorrencias`
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: "rgba(103, 153, 210, 0.28)", borderDash: [5, 6] },
                        suggestedMax: escalaMaximaTipo,
                        ticks: { display: false },
                        title: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { display: false }
                    }
                }
            },
            plugins: [labelBarrasPlugin]
        });
    }

    function renderizarResumoTipo(tiposOrdenados, total) {
        const legend = document.getElementById("typeLegend");
        const totalEl = document.getElementById("typeTotalHoje");
        if (totalEl) totalEl.textContent = String(total);
        if (!legend) return;

        legend.innerHTML = "";
        tiposOrdenados.forEach(([tipo, qtd], index) => {
            const cor = coresTipo[index] || coresTipo[0];
            legend.insertAdjacentHTML("beforeend", `
                <div class="type-legend-item" style="--type-color: ${cor}">
                    <span class="type-legend-color" aria-hidden="true"></span>
                    <span class="type-legend-name">${escapeHtml(tipo)}</span>
                    <span class="type-legend-count">${qtd}</span>
                </div>
            `);
        });
    }

    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        atualizarNomeOperador(user);

        let docsHoje = [];
        let docsPendentes = [];
        let docsAtivosAgentes = [];
        let docsHistoricoAgentes = [];
        const qHoje = query(collection(db, "ocorrencias_sttu"), where("data_filtro", "==", dataFiltro));
        const qPendentes = query(collection(db, "ocorrencias_sttu"), where("situacao", "in", STATUS_PAINEL_PENDENTES));
        const qHistoricoAgentes = query(collection(db, "historico_agentes"), where("dataRelatorio", "==", dataRelatorioFiltro));

        onSnapshot(qHoje, (snapshot) => {
            docsHoje = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(qPendentes, (snapshot) => {
            docsPendentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(collection(db, "ativos_agentes"), (snapshot) => {
            docsAtivosAgentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });

        onSnapshot(qHistoricoAgentes, (snapshot) => {
            docsHistoricoAgentes = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            atualizarDashboard(docsHoje, docsPendentes, docsAtivosAgentes, docsHistoricoAgentes);
        });
    });

    async function atualizarNomeOperador(user) {
        const smartUserName = document.getElementById("smartUserName");
        if (!smartUserName) return;

        let nome = user.displayName || "Visualizador";

        try {
            const snap = await getDoc(doc(db, "usuarios", user.uid));
            if (snap.exists()) {
                const dados = snap.data();
                nome = dados.nome || dados.nomeCompleto || nome;
            }
        } catch (error) {
            console.warn("Nao foi possivel buscar o nome do operador:", error);
        }

        smartUserName.textContent = `Ol\u00e1, ${nome}`;
    }
}

iniciarSmartwall().catch((error) => {
    console.error("Erro ao carregar smartwall:", error);
    alert("Erro ao conectar com Firebase. Verifique a conexao e atualize a pagina.");
});
