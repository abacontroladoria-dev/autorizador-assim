const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runQueries() {
  console.log('Executing validation queries...\n');

  // Query A: Profissionais EXCLUSIVAMENTE em unidade 177
  console.log('=== Query A: Profissionais EXCLUSIVAMENTE em unidade 177 ===\n');
  const { data: queryA, error: errorA } = await supabase.rpc('exec_query', {
    query: `SELECT
      g.profissional_id,
      MAX(g.nome_profissional) AS nome,
      COUNT(*) FILTER (WHERE g.id_unidade = 177) AS slots_177,
      COUNT(*) FILTER (WHERE g.id_unidade = 280) AS slots_280
    FROM grade_profissionais_tita g
    WHERE g.data BETWEEN date_trunc('week', CURRENT_DATE)::date
                     AND (date_trunc('week', CURRENT_DATE) + INTERVAL '4 days')::date
    GROUP BY g.profissional_id
    HAVING COUNT(*) FILTER (WHERE g.id_unidade = 280) = 0
    ORDER BY nome;`
  });

  if (errorA) {
    console.log('Using direct query instead...');
    const result = await supabase
      .from('grade_profissionais_tita')
      .select('profissional_id, nome_profissional, id_unidade, data');

    if (!result.error && result.data) {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 4);

      const filtered = result.data
        .filter(r => new Date(r.data) >= weekStart && new Date(r.data) <= weekEnd)
        .reduce((acc, r) => {
          if (!acc[r.profissional_id]) {
            acc[r.profissional_id] = {
              profissional_id: r.profissional_id,
              nome_profissional: r.nome_profissional,
              has_177: false,
              has_280: false,
              count_177: 0,
              count_280: 0
            };
          }
          if (r.id_unidade === 177) {
            acc[r.profissional_id].has_177 = true;
            acc[r.profissional_id].count_177++;
          }
          if (r.id_unidade === 280) {
            acc[r.profissional_id].has_280 = true;
            acc[r.profissional_id].count_280++;
          }
          return acc;
        }, {});

      const only177 = Object.values(filtered).filter(p => p.has_177 && !p.has_280);
      console.log(`Found ${only177.length} profissionais exclusively on unit 177:`);
      only177.forEach(p => {
        console.log(`  ID ${p.profissional_id}: ${p.nome_profissional} (slots_177=${p.count_177})`);
      });
    }
  } else {
    console.log(queryA);
  }

  console.log('\n=== Query B: Profissionais em AMBAS as unidades ===\n');
  const result2 = await supabase
    .from('grade_profissionais_tita')
    .select('profissional_id, nome_profissional, id_unidade, data');

  if (!result2.error && result2.data) {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 4);

    const filtered = result2.data
      .filter(r => new Date(r.data) >= weekStart && new Date(r.data) <= weekEnd)
      .reduce((acc, r) => {
        if (!acc[r.profissional_id]) {
          acc[r.profissional_id] = {
            profissional_id: r.profissional_id,
            nome_profissional: r.nome_profissional,
            has_177: false,
            has_280: false,
            count_177: 0,
            count_280: 0
          };
        }
        if (r.id_unidade === 177) {
          acc[r.profissional_id].has_177 = true;
          acc[r.profissional_id].count_177++;
        }
        if (r.id_unidade === 280) {
          acc[r.profissional_id].has_280 = true;
          acc[r.profissional_id].count_280++;
        }
        return acc;
      }, {});

    const both = Object.values(filtered).filter(p => p.has_177 && p.has_280);
    console.log(`Found ${both.length} profissionais on BOTH units 177 and 280:`);
    both.forEach(p => {
      console.log(`  ID ${p.profissional_id}: ${p.nome_profissional} (slots_177=${p.count_177}, slots_280=${p.count_280})`);
    });

    // Especificamente para os 4 nomes
    console.log('\n=== Verification for the 4 reported professionals ===\n');
    const reported = [
      { id: 8617, name: 'Anne Christine' },
      { id: 8587, name: 'Catislene' },
      { id: 8604, name: 'Vinicius' },
      { id: 8684, name: 'Daiane' }
    ];

    reported.forEach(prof => {
      const found = Object.values(filtered).find(p => p.profissional_id === prof.id);
      if (found) {
        console.log(`${prof.name} (${prof.id}): slots_177=${found.count_177}, slots_280=${found.count_280}`);
        if (found.has_177 && !found.has_280) {
          console.log(`  → SERÁ REMOVIDA (apenas unidade 177)`);
        } else if (found.has_280) {
          console.log(`  → PERMANECERÁ (tem registros em unidade 280)`);
        }
      } else {
        console.log(`${prof.name} (${prof.id}): NOT FOUND`);
      }
    });
  }
}

runQueries().catch(err => console.error('Error:', err));
