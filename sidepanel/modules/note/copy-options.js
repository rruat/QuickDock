import { t as tr } from '../i18n.js';
import { calculateAge, fmtTime, fmtTimeDiff, formatDateBR, maskCEP, maskCNPJ, maskCPF, maskPhone, onlyDigits, parseDate, parseDateRange, parseDateTimeRange, parseTimeRange } from './format.js';

// Unidade no singular ou plural conforme a quantidade (ex.: 1 dia / 2 dias).
const unidade = (n, um, varios) => (n === 1 ? tr(um) : tr(varios));

export function buildCopyOptions(type, raw) {
  const d = onlyDigits(raw);

  switch (type) {
    case 'cpf': {
      const masked = d.length === 11 ? maskCPF(d) : raw;
      return [
        { label: masked, hint: tr('com máscara'), value: masked },
        { label: d,      hint: tr('só números'),  value: d      },
      ];
    }
    case 'cnpj': {
      const stripped = raw.replace(/[.\-\/]/g, '').toUpperCase();
      const masked = stripped.length === 14 ? maskCNPJ(stripped) : raw;
      return [
        { label: masked,   hint: tr('com máscara'), value: masked   },
        { label: stripped, hint: tr('sem máscara'), value: stripped },
      ];
    }
    case 'phone': {
      const formatted = maskPhone(d.slice(0, 11));
      return [
        { label: formatted, hint: tr('formatado BR'), value: formatted },
        { label: d,         hint: tr('só números'),   value: d         },
      ];
    }
    case 'date': {
      const date = parseDate(raw);
      if (!date) return [{ label: raw, hint: tr('data'), value: raw }];
      const age    = calculateAge(date);
      const dateBR = formatDateBR(date);
      const idade  = `${age} ${unidade(age, 'ano', 'anos')}`;
      return [
        { label: dateBR,      hint: tr('data'),           value: dateBR },
        { label: idade,       hint: tr('idade'),          value: idade  },
        { label: String(age), hint: tr('só a idade'),     value: String(age) },
      ];
    }
    case 'cep': {
      const digits = onlyDigits(raw);
      const masked = digits.length === 8 ? maskCEP(digits) : raw;
      return [
        { label: masked,  hint: tr('com máscara'), value: masked  },
        { label: digits,  hint: tr('só números'),  value: digits  },
      ];
    }
    case 'daterange': {
      const range = parseDateRange(raw);
      if (!range) return [{ label: raw, hint: tr('período'), value: raw }];
      const { d1, d2, days } = range;
      const abs = Math.abs(days);
      const inv = days < 0 ? ` ${tr('(invertido)')}` : '';

      const opts = [];

      const dStr = `${abs} ${unidade(abs, 'dia', 'dias')}${inv}`;
      opts.push({ label: dStr, hint: tr('total em dias'), value: dStr });

      if (abs >= 7) {
        const w = Math.floor(abs / 7), rd = abs % 7;
        const wStr = `${w} ${unidade(w, 'semana', 'semanas')}${rd ? ` ${tr('e')} ${rd} ${unidade(rd, 'dia', 'dias')}` : ''}${inv}`;
        opts.push({ label: wStr, hint: tr('em semanas'), value: wStr });
      }

      if (abs >= 28) {
        const [lo, hi] = days >= 0 ? [d1, d2] : [d2, d1];
        let m = (hi.getFullYear() - lo.getFullYear()) * 12 + (hi.getMonth() - lo.getMonth());
        const pivot = new Date(lo.getFullYear(), lo.getMonth() + m, lo.getDate());
        if (pivot > hi) m--;
        const pivot2 = new Date(lo.getFullYear(), lo.getMonth() + m, lo.getDate());
        const rd = Math.round((hi - pivot2) / 86400000);
        const mStr = `${m} ${unidade(m, 'mês', 'meses')}${rd ? ` ${tr('e')} ${rd} ${unidade(rd, 'dia', 'dias')}` : ''}${inv}`;
        opts.push({ label: mStr, hint: tr('em meses'), value: mStr });
      }

      if (abs >= 365) {
        const [lo, hi] = days >= 0 ? [d1, d2] : [d2, d1];
        let y = hi.getFullYear() - lo.getFullYear();
        const pivot = new Date(lo.getFullYear() + y, lo.getMonth(), lo.getDate());
        if (pivot > hi) y--;
        const pivot2 = new Date(lo.getFullYear() + y, lo.getMonth(), lo.getDate());
        let rm = (hi.getFullYear() - pivot2.getFullYear()) * 12 + (hi.getMonth() - pivot2.getMonth());
        const yStr = `${y} ${unidade(y, 'ano', 'anos')}${rm ? ` ${tr('e')} ${rm} ${unidade(rm, 'mês', 'meses')}` : ''}${inv}`;
        opts.push({ label: yStr, hint: tr('em anos'), value: yStr });
      }

      const periodo = `${formatDateBR(d1)} ${tr('até')} ${formatDateBR(d2)}`;
      opts.push({ label: periodo, hint: tr('período formatado'), value: periodo });

      return opts;
    }
    case 'timerange': {
      const r = parseTimeRange(raw);
      if (!r) return [{ label: raw, hint: tr('intervalo'), value: raw }];
      const abs = Math.abs(r.diffSec);
      const inv = r.diffSec < 0 ? ` ${tr('(invertido)')}` : '';
      const opts = [];
      const totalMin = Math.round(abs / 60);
      const h = Math.floor(totalMin / 60), m = totalMin % 60;
      if (h > 0) {
        const s = `${h}h${m > 0 ? ` ${m}min` : ''}${inv}`;
        opts.push({ label: s, hint: tr('duração'), value: s });
      }
      const ms = `${totalMin} ${unidade(totalMin, 'minuto', 'minutos')}${inv}`;
      opts.push({ label: ms, hint: tr('em minutos'), value: ms });
      const periodo = `${fmtTime(r.t1)} ${tr('até')} ${fmtTime(r.t2)}`;
      opts.push({ label: periodo, hint: tr('período'), value: periodo });
      return opts;
    }
    case 'datetimerange': {
      const r = parseDateTimeRange(raw);
      if (!r) return [{ label: raw, hint: tr('período'), value: raw }];
      const abs = Math.abs(r.diffSec);
      const inv = r.diffSec < 0 ? ` ${tr('(invertido)')}` : '';
      const opts = [];
      const duracao = `${fmtTimeDiff(abs)}${inv}`;
      opts.push({ label: duracao, hint: tr('duração'), value: duracao });
      const totalH = Math.floor(abs / 3600), remMin = Math.round((abs % 3600) / 60);
      const hs = `${totalH}h${remMin > 0 ? ` ${remMin}min` : ''}${inv}`;
      opts.push({ label: hs, hint: tr('total em horas'), value: hs });
      const totalMin = Math.round(abs / 60);
      const tm = `${totalMin} ${unidade(totalMin, 'minuto', 'minutos')}${inv}`;
      opts.push({ label: tm, hint: tr('total em minutos'), value: tm });
      opts.push({ label: raw, hint: tr('período'), value: raw });
      return opts;
    }
    case 'email': {
      const lower = raw.toLowerCase();
      const opts = [{ label: raw, hint: tr('email'), value: raw }];
      if (lower !== raw) opts.push({ label: lower, hint: tr('minúsculas'), value: lower });
      return opts;
    }
    default:
      return [{ label: raw, hint: '', value: raw }];
  }
}
