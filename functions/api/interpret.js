const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

function getBody(event) {
  if (!event) return {};

  if (typeof event === 'string') {
    try {
      return JSON.parse(event);
    } catch (error) {
      return {};
    }
  }

  if (typeof event.body === 'string') {
    try {
      return JSON.parse(event.body);
    } catch (error) {
      return {};
    }
  }

  if (event.body && typeof event.body === 'object') {
    return event.body;
  }

  return {};
}

function buildPrompt(vals) {
  const FIELD_META = {
    height: { label: '키', unit: 'cm' },
    weight: { label: '몸무게', unit: 'kg' },
    waist: { label: '허리둘레', unit: 'cm' },
    glucose: { label: '혈당(공복)', unit: 'mg/dL' },
    hemoglobin: { label: '혈색소', unit: 'g/dL' },
    total_chol: { label: '총 콜레스테롤', unit: 'mg/dL' },
    hdl: { label: 'HDL 콜레스테롤', unit: 'mg/dL' },
    ldl: { label: 'LDL 콜레스테롤', unit: 'mg/dL' },
    triglyceride: { label: '중성지방', unit: 'mg/dL' },
    ast: { label: 'AST', unit: 'U/L' },
    alt: { label: 'ALT', unit: 'U/L' },
    ggt: { label: '감마GTP', unit: 'U/L' },
    creatinine: { label: '크레아티닌', unit: 'mg/dL' },
    egfr: { label: 'e-GFR', unit: 'mL/min' },
    bp_sys: { label: '수축기 혈압', unit: 'mmHg' },
    bp_dia: { label: '이완기 혈압', unit: 'mmHg' },
    bone_density: { label: '골밀도(T-score)', unit: 'SD' },
    tsh: { label: 'TSH(갑상선)', unit: 'mIU/L' },
  };

  const lines = Object.entries(vals)
    .map(([key, value]) => `- ${FIELD_META[key]?.label || key}: ${value} ${FIELD_META[key]?.unit || ''}`)
    .join('\n');

  let bmiNote = '';
  if (vals.height && vals.weight) {
    const bmi = (vals.weight / ((vals.height / 100) ** 2)).toFixed(1);
    bmiNote = `\n※ 참고 BMI: ${bmi} (자동 계산)`;
  }

  const gender = vals.gender || '성별 미선택';

  return `당신은 한국의 의학 정보 전문가입니다. 50~60대 일반인이 건강검진 결과를 이해할 수 있도록 쉽고 친절하게 설명해주세요.

성별: ${gender}

아래 건강검진 수치를 분석하여 반드시 아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.

입력된 수치:
${lines}${bmiNote}

응답 JSON 형식:
{"score":75,"summary":"전체 요약 2~3문장","items":[{"key":"glucose","label":"혈당(공복)","value":95,"unit":"mg/dL","status":"good","desc":"정상입니다."}],"advice":["조언1","조언2","조언3"]}

규칙:
- score: 0~100 (100이 최고)
- status: "good"(정상) / "warn"(주의) / "bad"(위험)
- items: 입력된 수치만 포함, 키·몸무게 있으면 BMI 항목 추가
- advice: 3~5개, 성별·50대 맞춤 실천 가능한 조언
- 모든 설명 의학 용어 없이 쉽게
- 혈색소 기준: 남성 13 이상, 여성 12 이상
- 허리둘레 복부비만: 남성 90 이상, 여성 85 이상
- 골밀도 T-score: -1.0 이상 정상, -1.0~-2.5 골감소증, -2.5 미만 골다공증
- TSH: 0.4~4.0 정상, 낮으면 갑상선 기능 항진 의심, 높으면 기능 저하 의심
- 여성이면 골밀도·갑상선 관련 조언 포함`;
}

function buildSuccessResponse(body) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function buildErrorResponse(statusCode, message) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
    body: JSON.stringify({ error: message }),
  };
}

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.');
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(payload) }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('OpenAI API 응답이 비어 있습니다.');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    return { score: 0, summary: '분석 결과를 불러오지 못했습니다.', items: [], advice: ['잠시 후 다시 시도해 주세요.'] };
  }
}

module.exports = {
  handler: async function (event) {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
        body: '',
      };
    }

    try {
      const body = getBody(event);
      if (!body || Object.keys(body).length === 0) {
        return buildErrorResponse(400, '요청 본문이 비어 있습니다.');
      }

      const result = await callOpenAI(body);
      return buildSuccessResponse(result);
    } catch (error) {
      return buildErrorResponse(500, error.message || '분석 요청 처리 중 오류가 발생했습니다.');
    }
  },
};
