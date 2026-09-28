// Modelos JSON pré-definidos, usados pelo popover "Novo JSON" e como valor
// inicial do JSON Studio.
// ── Modelos Pré-definidos ───────────────────────────────────────────────────
export const JSON_TEMPLATES = {
  'empty-object': {},
  'empty-array': [],
  'records-list': [
    {
      nome: "DAYSE ALVES MARQUES",
      cpf: "07216577450",
      dataNascimento: "14/03/1993",
      reducaoCarencia: "",
      migracao: ""
    },
    {
      nome: "JOSE DANIEL MARQUES DE OLIVEIRA",
      cpf: "11812001487",
      dataNascimento: "05/08/2026",
      reducaoCarencia: "NAO",
      migracao: "NAO"
    }
  ],
  'user-profile': {
    id: 101,
    nome: "Maria Silva",
    email: "maria.silva@exemplo.com",
    ativo: true,
    papel: "admin",
    interesses: ["desenvolvimento", "design", "produtividade"],
    endereco: {
      rua: "Av. Central",
      numero: 500,
      cidade: "São Paulo",
      estado: "SP",
      pais: "Brasil"
    },
    telefone: null
  },
  'app-config': {
    app: "QuickDock Studio",
    versao: "3.5.0",
    servidor: {
      host: "localhost",
      porta: 8080,
      ssl: true
    },
    recursos: {
      modoEscuro: true,
      autoSalvar: true,
      intervaloSegundos: 30
    },
    tags: ["produtivo", "notas", "desktop", "mobile"]
  },
  'api-response': {
    status: 200,
    mensagem: "Operação realizada com sucesso",
    dados: [
      { id: 1, titulo: "Aprender QuickDock", concluido: true },
      { id: 2, titulo: "Dominar JSON Studio", concluido: false }
    ],
    paginacao: {
      paginaAtual: 1,
      totalPaginas: 5,
      totalRegistros: 42
    }
  }
};
