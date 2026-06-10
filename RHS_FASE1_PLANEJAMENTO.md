# RHS – Rocha Heavy Parts
# FASE 1 - PLANEJAMENTO COMPLETO

**Versão:** 1.0  
**Data:** Junho 2024  
**Status:** Fase 1 - Planejamento  
**Responsável:** Equipe de Desenvolvimento RHS

---

## 📋 ÍNDICE

1. [PRD - Product Requirements Document](#prd)
2. [Arquitetura Técnica](#arquitetura)
3. [Banco de Dados](#banco-de-dados)
4. [Estrutura de Pastas](#estrutura)
5. [Wireframes](#wireframes)
6. [Fluxogramas](#fluxogramas)

---

## PRD - Product Requirements Document {#prd}

### Sumário Executivo

O projeto RHS – Rocha Heavy Parts é um marketplace especializado em peças para máquinas pesadas.

**Slogan:** Força, Disponibilidade e Performance

**Objetivo:** MVP profissional com busca por Part Number, compatibilidade e equivalência entre fabricantes.

### Missão
Fornecer peças e soluções confiáveis para maximizar a disponibilidade e a performance dos equipamentos pesados.

### Visão
Ser referência nacional na comercialização de peças para máquinas pesadas, reconhecida pela agilidade, disponibilidade e conhecimento técnico.

### Valores
- Segurança
- Integridade
- Disponibilidade
- Agilidade
- Excelência Técnica
- Foco no Cliente

### Público-Alvo
- Empresas de terraplenagem
- Mineradoras
- Empresas florestais
- Aterros sanitários
- Construtoras
- Oficinas mecânicas
- PCM
- Compradores
- Gestores de manutenção
- Proprietários de máquinas

### Marcas Atendidas
CAT | John Deere | Hyundai | Komatsu | Volvo | CASE | JCB | XCMG | SEM | Dynapac | SANY | LiuGong

### Diferencial Competitivo
1. **Busca Inteligente**: Part Number, Modelo, Fabricante, Categoria, Palavra-chave
2. **Compatibilidade**: Verificação automática com equipamentos
3. **Equivalência**: Múltiplas marcas equivalentes
4. **Dropshipping Automatizado**: Integração com fornecedores
5. **Marketplace**: Múltiplos fornecedores por produto

### Categorias de Produtos
Filtros | Correias | Sensores | Sistema Hidráulico | Sistema Elétrico | Motor | Transmissão | Material Rodante | Arrefecimento | Ar Condicionado | Componentes de Cabine

### Tecnologias
- **Frontend**: Next.js 14 + React + Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Pagamento**: Mercado Pago
- **Hospedagem**: Vercel

---

## Arquitetura Técnica {#arquitetura}

### Visão Geral

```
┌─────────────────────────────┐
│  Frontend (Next.js)         │
│  - Homepage                 │
│  - Busca                    │
│  - Carrinho                 │
│  - Dashboard                │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│  API Routes                 │
│  - /api/auth                │
│  - /api/produtos            │
│  - /api/pedidos             │
│  - /api/fornecedores        │
│  - /api/pagamentos          │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│  Supabase                   │
│  - PostgreSQL               │
│  - Auth                     │
│  - Storage                  │
│  - Real-time                │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│  Integrações                │
│  - Mercado Pago             │
│  - SendGrid                 │
│  - Twilio                   │
└─────────────────────────────┘
```

### Endpoints de API

#### Autenticação
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me

#### Produtos
- GET /api/produtos
- GET /api/produtos/[id]
- GET /api/produtos/search?q=126-1817
- GET /api/produtos/compatibilidade/[modelo]
- GET /api/produtos/equivalencia/[partNumber]

#### Pedidos
- POST /api/pedidos
- GET /api/pedidos
- GET /api/pedidos/[id]
- PUT /api/pedidos/[id]

#### Fornecedores
- GET /api/fornecedores
- GET /api/fornecedores/[id]
- POST /api/fornecedores

#### Pagamentos
- POST /api/pagamentos/criar-preferencia
- POST /api/pagamentos/webhook

---

## Banco de Dados {#banco-de-dados}

### Tabelas Principais

```
USUARIOS
├── id, email, nome, role (cliente/fornecedor/admin)
├── CLIENTES (empresa, cnpj, endereço)
├── FORNECEDORES (cnpj, whatsapp, prazo_medio)
├── LOGS_AUDITORIA
└── NOTIFICACOES

CATEGORIAS
└── PRODUTOS (part_number, fabricante, preco_base)
    ├── COMPATIBILIDADES (marca, modelo)
    ├── EQUIVALENCIAS (fabricante_equiv, part_number_equiv)
    └── PRODUTOS_FORNECEDORES (preço, prazo, estoque)

PEDIDOS (status, valor_total, endereco_entrega)
├── ITENS_PEDIDO (produto_id, fornecedor_id, quantidade)
├── PAGAMENTOS (transacao_id_mp, status_pagamento)
└── AVALIACOES (nota, comentário)
```

### Índices Críticos

```sql
CREATE INDEX idx_produtos_part_number ON produtos (part_number);
CREATE INDEX idx_produtos_fabricante ON produtos (fabricante);
CREATE INDEX idx_prod_forn_produto_id ON produtos_fornecedores (produto_id);
CREATE INDEX idx_pedidos_cliente_id ON pedidos (cliente_id);
CREATE INDEX idx_pedidos_status ON pedidos (status);
```

### Views Úteis

```sql
vw_produtos_melhor_preco
vw_pedidos_detalhados
vw_desempenho_fornecedor
```

---

## Estrutura de Pastas {#estrutura}

```
rhs-rocha-heavy-parts/
├── docs/
│   ├── PRD.md
│   ├── ARQUITETURA.md
│   ├── BANCO_DE_DADOS.md
│   ├── ESTRUTURA_PASTAS.md
│   ├── WIREFRAMES.md
│   └── FLUXOGRAMAS.md
│
├── app/
│   ├── page.tsx                    # Homepage
│   ├── layout.tsx                  # Layout global
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── busca/
│   │   ├── page.tsx
│   │   ├── [part-number]/page.tsx
│   │   └── [modelo]/page.tsx
│   ├── produtos/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── carrinho/
│   │   └── page.tsx
│   ├── checkout/
│   │   └── page.tsx
│   ├── pedidos/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── fornecedor/
│   │   ├── dashboard/page.tsx
│   │   └── pedidos/page.tsx
│   ├── admin/
│   │   ├── dashboard/page.tsx
│   │   ├── produtos/page.tsx
│   │   ├── fornecedores/page.tsx
│   │   └── pedidos/page.tsx
│   ├── api/
│   │   ├── auth/[...auth].ts
│   │   ├── produtos/route.ts
│   │   ├── pedidos/route.ts
│   │   ├── fornecedores/route.ts
│   │   └── pagamentos/route.ts
│   └── globals.css
│
├── components/
│   ├── Header.tsx
│   ├── Footer.tsx
│   ├── Navbar.tsx
│   ├── SearchBar.tsx
│   ├── ProductCard.tsx
│   ├── CategoryFilter.tsx
│   ├── Dashboard/
│   │   ├── StatCard.tsx
│   │   └── ChartRevenue.tsx
│   └── Common/
│       ├── Button.tsx
│       ├── Input.tsx
│       └── Modal.tsx
│
├── hooks/
│   ├── useAuth.ts
│   ├── useCart.ts
│   ├── useSearch.ts
│   ├── useProducts.ts
│   └── useOrders.ts
│
├── services/
│   ├── api.ts
│   ├── auth.service.ts
│   ├── product.service.ts
│   ├── order.service.ts
│   └── payment.service.ts
│
├── types/
│   ├── index.ts
│   ├── product.ts
│   ├── order.ts
│   └── user.ts
│
├── lib/
│   ├── supabase.ts
│   ├── validators.ts
│   └── utils.ts
│
├── public/
│   ├── logo.svg
│   ├── banner.jpg
│   └── images/
│
├── .env.local.example
├── .gitignore
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── README.md
```

---

## Wireframes {#wireframes}

### Homepage

```
┌─────────────────────────────────────┐
│         HEADER / NAVBAR              │
│  Logo    [Busca Part Number] Login  │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│      BANNER PRINCIPAL               │
│  "Força, Disponibilidade e Perf."  │
│     [Campo de busca destacado]      │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  MARCAS ATENDIDAS (Logos em carousel)
│  CAT | John Deere | Komatsu | ...   │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  CATEGORIAS (11 cards)               │
│ Filtros | Correias | Sensores | ... │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  PRODUTOS EM DESTAQUE (6 cards)      │
│ Produto1 | Produto2 | Produto3      │
│ Produto4 | Produto5 | Produto6      │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  DIFERENCIAIS                        │
│ ✓ Busca por Part Number              │
│ ✓ Compatibilidade garantida          │
│ ✓ Múltiplos fornecedores             │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  AVALIAÇÕES DE CLIENTES              │
│ ⭐⭐⭐⭐⭐ "Excelente produto" - João │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  CONTATO RÁPIDO                      │
│ 📞 (XX) XXXXX-XXXX                   │
│ 💬 Falar no WhatsApp                 │
│ 📧 contato@rhsrocha.com.br           │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│           FOOTER                     │
│ Sobre | Produtos | Contato | Redes  │
└─────────────────────────────────────┘
```

### Página de Produto

```
┌─────────────────────────────────────┐
│          NAVBAR                      │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  BREADCRUMB                          │
│  Home > Filtros > CAT 126-1817       │
└──────────┬──────────────────────────┘
           │
┌────────────────────────────────────┐
│ PRODUTO:                             │ 
│ ┌─────────┬──────────────────────┐  │
│ │ Imagem  │ Nome: CAT 126-1817   │  │
│ │ Grande  │ Part Number: 126-1817│  │
│ │         │ Fabricante: CAT      │  │
│ │ Miniat. │ Categoria: Filtros   │  │
│ └─────────┼──────────────────────┤  │
│           │ Preço: R$ 450,00      │  │
│           │ Estoque: 12 un.       │  │
│           │ Prazo: 2-3 dias       │  │
│           │ [+ Carrinho]          │  │
│           │ [Wishlist]            │  │
│           └──────────────────────┘  │
└────────────────────────────────────┘
           │
┌────────────────────────────────────┐
│ COMPATIBILIDADES                     │
│ ✓ CAT 320GC                          │
│ ✓ CAT 320D                           │
│ ✓ CAT 320D2                          │
│ ✓ CAT 323                            │
└────────────────────────────────────┘
           │
┌────────────────────────────────────┐
│ EQUIVALÊNCIAS                        │
│ • Fleetguard FF5052                  │
│ • Donaldson P165051                  │
│ • Baldwin BF1265                     │
└────────────────────────────────────┘
           │
┌────────────────────────────────────┐
│ FORNECEDORES                         │
│ ┌────────────────────────────────┐ │
│ │ Fornecedor A                   │ │
│ │ R$ 450,00 | Prazo: 2 dias      │ │
│ │ ⭐⭐⭐⭐⭐ (120 avaliações)     │ │
│ │ [Selecionar]                   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ Fornecedor B                   │ │
│ │ R$ 480,00 | Prazo: 3 dias      │ │
│ │ ⭐⭐⭐⭐ (89 avaliações)       │ │
│ │ [Selecionar]                   │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
           │
┌────────────────────────────────────┐
│ DESCRIÇÃO                            │
│ Lorem ipsum dolor sit amet...        │
└────────────────────────────────────┘
           │
┌────────────────────────────────────┐
│ AVALIAÇÕES                           │
│ ⭐⭐⭐⭐⭐ "Produto excelente" - João  │
│ ⭐⭐⭐⭐ "Bom custo benefício" - Maria │
└────────────────────────────────────┘
```

### Carrinho

```
┌─────────────────────────────────────┐
│         NAVBAR                       │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  CARRINHO (2 itens)                  │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ CAT 126-1817 (Fornecedor A)    │  │
│ │ R$ 450,00 x 2 = R$ 900,00      │  │
│ │ [—] 2 [+]  [Remover]           │  │
│ └────────────────────────────────┘  │
│                                      │
│ ┌────────────────────────────────┐  │
│ │ Komatsu ABC-123 (Fornecedor B) │  │
│ │ R$ 1.200,00 x 1 = R$ 1.200,00  │  │
│ │ [—] 1 [+]  [Remover]           │  │
│ └────────────────────────────────┘  │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  RESUMO                              │
│  Subtotal........... R$ 2.100,00     │
│  Frete.............. R$ 150,00      │
│  Desconto........... R$ 0,00        │
│  ─────────────────────────────────  │
│  TOTAL.............. R$ 2.250,00    │
│                                      │
│  [Continuar Comprando] [Checkout]   │
└─────────────────────────────────────┘
```

### Checkout

```
┌─────────────────────────────────────┐
│         NAVBAR                       │
└──────────┬──────────────────────────┘
           │
┌──────────▼──────────────────────────┐
│  CHECKOUT - PASSO 1 DE 3             │
│                                      │
│  DADOS PESSOAIS                      │
│  ┌──────────────────────────────┐   │
│  │ Nome: [_____________________] │   │
│  │ Email: [____________________] │   │
│  │ Telefone: [_________________] │   │
│  │ CNPJ/CPF: [_________________] │   │
│  └──────────────────────────────┘   │
│                                      │
│  ENDEREÇO DE ENTREGA                 │
│  ┌──────────────────────────────┐   │
│  │ Rua: [_____________________] │   │
│  │ Número: [___] Compl: [_____] │   │
│  │ Cidade: [___] Estado: [__]    │   │
│  │ CEP: [___________]            │   │
│  └──────────────────────────────┘   │
│                                      │
│  [← Voltar] [Próximo →]              │
└─────────────────────────────────────┘
```

---

## Fluxogramas {#fluxogramas}

### Fluxo de Busca

```
┌─ Usuário acessa homepage
│
├─ Digita Part Number (126-1817)
│
├─ Sistema busca no banco
│
├─ Resultado encontrado?
│  ├─ SIM: Exibe produto com:
│  │      ├─ Compatibilidades
│  │      ├─ Equivalências
│  │      └─ Fornecedores/Preços
│  │
│  └─ NÃO: Mensagem "Produto não encontrado"
│         └─ Sugerir busca por modelo
│
└─ Cliente seleciona fornecedor e vai para carrinho
```

### Fluxo de Compra (Dropshipping)

```
1. Cliente faz checkout
2. Sistema valida estoque
3. Redireciona para Mercado Pago
4. Cliente efetua pagamento
5. MP envia webhook de confirmação
6. Sistema cria pedido (status: pendente)
7. Notifica fornecedor por:
   ├─ Email
   ├─ WhatsApp
   └─ Dashboard
8. Fornecedor confirma disponibilidade
9. Sistema atualiza status: confirmado
10. Fornecedor despacha
11. Sistema atualiza status: despachado
12. Cliente recebe código de rastreio
13. Entrega realizada
14. Sistema atualiza status: entregue
15. Cliente avalia fornecedor
```

### Fluxo de Autenticação

```
┌─ Usuário acessa plataforma
│
├─ Autenticado?
│  ├─ SIM: Token JWT válido?
│  │      ├─ SIM: Acesso autorizado
│  │      └─ NÃO: Atualizar token
│  │
│  └─ NÃO: Redirecionar para login
│
├─ Tela de Login
│  ├─ Email + Senha
│  └─ [Login] [Registrar] [Esqueci senha]
│
├─ Validação Supabase Auth
│
└─ Gera JWT e armazena em httpOnly cookie
```

---

## 📊 Cronograma

| Fase | Descrição | Duração | Status |
|------|-----------|---------|--------|
| **Fase 1** | Planejamento | 1 semana | 🔄 Em Andamento |
| **Fase 2** | Frontend | 2 semanas | ⏳ Aguardando |
| **Fase 3** | Backend | 2 semanas | ⏳ Aguardando |
| **Fase 4** | Integrações | 1 semana | ⏳ Aguardando |
| **Fase 5** | Dashboard | 1 semana | ⏳ Aguardando |
| **Fase 6** | Documentação | 3 dias | ⏳ Aguardando |

**Total:** ~8 semanas

---

## 🎨 Identidade Visual

### Marca
- **Nome:** RHS – ROCHA HEAVY PARTS
- **Slogan:** Força, Disponibilidade e Performance
- **Estilo:** Minimalista corporativo premium

### Cores Oficiais
- **Preto Grafite:** #1F2937 (Confiança, Força)
- **Branco:** #FFFFFF (Limpeza, Modernidade)
- **Amarelo Industrial:** #FBBF24 (Atenção, Segurança)

### Logo
- Monograma RHS
- Inspirado em esteiras e equipamentos pesados
- Visual corporativo premium

---

## ✅ Checklist de Aprovação

- [ ] PRD aprovado
- [ ] Arquitetura validada
- [ ] Banco de Dados revisado
- [ ] Estrutura de pastas confirmada
- [ ] Wireframes aprovados
- [ ] Fluxogramas confirmados
- [ ] Equipe pronta para Fase 2

---

## 📞 Próximas Etapas

Quando esta documentação de planejamento for **APROVADA**, iniciar:

✅ **Fase 2: Frontend**
- Implementação das páginas em Next.js
- Componentes React reutilizáveis
- Integração com CSS Tailwind

**NÃO ESCREVER CÓDIGO ANTES DA APROVAÇÃO**

---

**Documento preparado para revisão e aprovação da equipe de stakeholders.**
