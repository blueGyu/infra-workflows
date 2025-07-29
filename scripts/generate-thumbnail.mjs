import path from "path";
import matter from "gray-matter";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, existsSync, writeFileSync } from "fs";

// 로컬 폰트 파일 로드
const fontPath = path.join(process.cwd(), "fonts", "NotoSansKR-Regular.ttf");
let fontArrayBuffer;

try {
  const fontBuffer = readFileSync(fontPath);
  fontArrayBuffer = Uint8Array.from(fontBuffer).buffer;
  console.log("✅ 폰트 파일 로드 성공");
} catch (error) {
  console.error(`❌ 폰트 파일을 찾을 수 없습니다: ${fontPath}`);
  console.error("기본 폰트를 사용합니다.");
  fontArrayBuffer = null;
}

// 실행
async function generateThumbnails() {
  try {
    const argvs = process.argv.slice(2);

    if (argvs.length === 0) {
      throw new Error("No files provided");
    } else {
      for (const file of argvs) {
        if (file.endsWith(".mdx") || file.endsWith(".md")) {
          if (!existsSync(file)) {
            throw new Error("No files provided");
          } else {
            await generateThumbnailFromMarkdown(file);
          }
        }
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

generateThumbnails().catch(console.error);

// 썸네일 생성
async function generateThumbnailFromMarkdown(mdxPath) {
  try {
    const markdownFile = readFileSync(mdxPath, "utf-8");
    const { data } = matter(markdownFile);

    console.log(`Generating thumbnail for: ${data.title}`);

    const svg = await satori(
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            color: "white",
            padding: "40px",
            boxSizing: "border-box",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  fontSize: "48px",
                  fontWeight: "bold",
                  textAlign: "center",
                  marginBottom: "20px",
                  lineHeight: "1.2",
                  maxWidth: "1000px",
                },
                children: data.title,
              },
            },
          ],
        },
      },
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: "Noto Sans KR",
            data: fontArrayBuffer,
            weight: 400,
            style: "normal",
          },
        ],
      }
    );

    const resvg = new Resvg(svg);
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    const relativePath = mdxPath.replace(/\/[^\/]+\.mdx?$/, "");
    const thumbnailPath = path.join(relativePath, "thumbnail.png");
    writeFileSync(thumbnailPath, pngBuffer);

    console.log(`✅ Generated thumbnail: ${thumbnailPath}`);
  } catch (error) {
    console.error(`❌ Error generating thumbnail for ${mdxPath}:`, error);
  }
}
