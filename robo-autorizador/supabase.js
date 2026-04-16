/**

* =========================
* SUPABASE CLIENT
* =========================
* Responsável por:
* * Criar conexão com Supabase
* * Usar variáveis do .env
    */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// =========================
// CONFIGURAÇÃO
// =========================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// =========================
// VALIDAÇÃO (IMPORTANTE)
// =========================

if (!SUPABASE_URL) {
throw new Error("❌ SUPABASE_URL não definida no .env");
}

if (!SUPABASE_KEY) {
throw new Error("❌ SUPABASE_KEY não definida no .env");
}

// =========================
// CLIENTE
// =========================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================
// EXPORT
// =========================

module.exports = supabase;
