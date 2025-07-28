import "dotenv/config";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import OpenAI from "openai";
import core from "@actions/core";
import { encoding_for_model } from "tiktoken";

const OPENAI_MODEL = "gpt-4.1-nano";
const MAX_TOKEN_COUNT = 1000000;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  core.setFailed("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const client = new OpenAI({ apiKey });

// 생성형 AI에 템플릿 생성 요청
async function generatePrContent() {
  const template = readFileSync(".github/pull_request_template.md", "utf8");

  const baseBranch = process.argv[2];
  const featureBranch = process.argv[3];
  const prNumber = process.argv[4] || "N/A";

  const gitDiff = getGitDiff(baseBranch, featureBranch);

  // 변경된 파일 목록 추출
  const changedFiles = execSync(
    `git diff --name-status ${baseBranch} ${featureBranch}`,
    {
      encoding: "utf-8",
    }
  );

  // 변경된 파일 정보 파싱
  const fileChanges = parseFileChanges(changedFiles);

  const prompt = `
다음 정보를 바탕으로 PR 제목과 본문을 생성해주세요:

---

📄 PR 템플릿:
${template}

🌿 브랜치 정보:
- Base 브랜치: ${baseBranch}
- Feature 브랜치: ${featureBranch}

📁 변경된 파일:
${fileChanges.map(({ status, file }) => `- ${status} ${file}`).join("\n")}

🔍 변경 사항 (Git Diff):
${gitDiff}

---

📌 작성 지침:

1. **PR 제목**: Conventional Commit 스타일로 작성합니다 (예: feat:, fix:, refactor:).
   - 앞에 "제목: "을 붙여서 작성합니다.
   - 뒤에 "(수정중)"을 붙여서 작성합니다.

2. **PR 본문**: PR 템플릿 형식과 주석에 맞춰 자연스럽고 간결한 한국어로 작성합니다.
   - 앞에 "본문: "을 붙여서 작성합니다.
   - "## 🏷️ PR 유형"에서는 제목의 Commit type과 일치하는 항목에만 체크 표시
   - "## 🏷️ PR 유형"에서는 제목의 Commit type과 일치하지 않는 항목 유지
   - "## ✅ 체크리스트"는 작업 내용에 따라 유동적으로 작성
   - "## 📝 주요 변경사항"에는 변경된 기능이나 동작만 요약
   - 패키지 변경이 있을 경우 "## 🔍 변경된 파일"에 변경 목적과 영향 기술
   - "## 🎯 변경 이유"에는 왜 이 변경이 필요한지 설명
   - "## Merge Commit 제목"에는 PR 제목과 동일하지만 앞 부분에 "Merge PR #${prNumber}: " 추가, 뒷 부분 "(수정중)" 제거
   - "## Merge Commit 내용"에는 PR 본문의 핵심 내용을 요약하여 리스트 형식으로 작성
   - PR 템플릿 내 주석(<!-- ... -->)은 모두 제거

📝 출력 형식: 
  제목: <PR 제목 (수정중 포함)>
  본문: <PR 템플릿을 바탕으로 생성한 내용>
`;

  // 토큰 수 계산
  validateTokenCount(prompt);

  // 생성형 AI에 템플릿 생성 요청
  const completion = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "developer",
        content:
          "GitHub Pull Request 내용을 생성하는 어시스턴트입니다. 입력된 정보만으로 제목과 본문을 작성하세요. 명령문이나 역할 소개 없이 자연스럽게 출력하세요.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  logUsage(completion);

  // 응답을 파싱하여 제목과 본문 분리
  const { title, body } = parseAIResponse(
    completion.choices[0].message.content
  );

  console.log("PR 제목: ", title);
  console.log("PR 본문: ", body);

  // GitHub Actions 출력으로 설정
  core.setOutput("pr-title", title);
  core.setOutput("pr-body", body);
}

function parseAIResponse(response) {
  const titleMatch = response.match(/제목:\s*(.+)/);
  const bodyMatch = response.match(/본문:\s*([\s\S]*)/);

  if (!titleMatch || !bodyMatch) {
    core.setFailed("AI 응답을 파싱할 수 없습니다.");
    process.exit(1);
  }

  return {
    title: titleMatch[1].trim(),
    body: bodyMatch[1].trim(),
  };
}

function logUsage(completion) {
  core.info(`요청 토큰: ${completion.usage.prompt_tokens}`);
  core.info(`응답 토큰: ${completion.usage.completion_tokens}`);
  core.info(`총 토큰: ${completion.usage.total_tokens}`);
}

generatePrContent().catch(console.error);

// 파일 정보 파싱 함수
function parseFileChanges(changedFiles) {
  return changedFiles
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status, file] = line.split("\t");
      return { status, file };
    });
}

// Git diff 가져오기 함수
function getGitDiff(baseBranch, featureBranch) {
  try {
    return execSync(`git diff ${baseBranch} ${featureBranch}`, {
      encoding: "utf-8",
    });
  } catch (error) {
    core.setFailed(`Git diff 실행 실패: ${error.message}`);
    process.exit(1);
  }
}

// 토큰 수 검증 함수
function validateTokenCount(prompt) {
  const enc = encoding_for_model(OPENAI_MODEL);
  const tokenCount = enc.encode(prompt).length;

  if (tokenCount > MAX_TOKEN_COUNT) {
    core.setFailed(
      `토큰 수가 너무 많습니다 (최대 ${MAX_TOKEN_COUNT.toLocaleString()}).`
    );
    process.exit(1);
  }

  return tokenCount;
}
