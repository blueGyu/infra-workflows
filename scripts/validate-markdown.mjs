import { readFileSync, existsSync } from "fs";
import core from "@actions/core";
import matter from "gray-matter";

// 필수 frontmatter 키 정의
const REQUIRED_FIELDS = ["title", "description", "date", "tags", "category"];

// 값이 비어있는지 확인하는 헬퍼 함수
const isEmpty = (value) => {
  return value === undefined || value === null || value === "";
};

// 필수 키 검증 함수
const validateRequiredKeys = (data, file) => {
  for (const key of REQUIRED_FIELDS) {
    if (!(key in data)) {
      throw new Error(`${file}: 필수 키 '${key}'가 누락되었습니다`);
    }
    if (isEmpty(data[key])) {
      throw new Error(`${file}: 필수 키 '${key}'의 값이 비어있습니다`);
    }
  }
};

// 불필요한 키 검증 함수
const validateNoExtraKeys = (data, file) => {
  for (const key of Object.keys(data)) {
    if (!REQUIRED_FIELDS.includes(key)) {
      throw new Error(`${file}: 필요없는 키 '${key}'가 존재합니다`);
    }
  }
};

// 마크다운 파일 검증 함수
const validateFrontmatter = (file) => {
  const markdownFile = readFileSync(file, "utf-8");
  const { data } = matter(markdownFile);

  validateNoExtraKeys(data, file);
  validateRequiredKeys(data, file);
};

// 실행
async function validateMarkdown() {
  try {
    const files = process.argv.slice(2);

    if (!files || files.length === 0) {
      throw new Error("No files provided");
    }

    for (const file of files) {
      if (file.endsWith(".mdx") || file.endsWith(".md")) {
        if (!existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        } else {
          validateFrontmatter(file);
        }
      }
    }
  } catch (error) {
    console.error(error.message);
    core.setFailed(`마크다운 검증 실패: ${error.message}`);
    process.exit(1);
  }
}

validateMarkdown().catch(console.error);
