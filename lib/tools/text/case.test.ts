import { describe, expect, it } from "vitest";
import { DEFAULT_CASE_OPTIONS, caseLabels, convertCase, splitWords, type CaseOptions, type TextCase } from "./case";

const to = (text: string, textCase: TextCase, options: Partial<CaseOptions> = {}) =>
  convertCase(text, textCase, { ...DEFAULT_CASE_OPTIONS, ...options });

describe("splitWords", () => {
  it("breaks at camelCase humps, acronyms and numbers", () => {
    expect(splitWords("XMLHttpRequest2")).toEqual(["XML", "Http", "Request", "2"]);
    expect(splitWords("getUserID")).toEqual(["get", "User", "ID"]);
    expect(splitWords("iPhone 15 Pro")).toEqual(["i", "Phone", "15", "Pro"]);
  });

  it("breaks at spaces and punctuation, keeping words with apostrophes whole", () => {
    expect(splitWords("hello_world-foo.bar/baz qux")).toEqual(["hello", "world", "foo", "bar", "baz", "qux"]);
    expect(splitWords("Don't stop")).toEqual(["Dont", "stop"]);
  });

  it("transliterates on request", () => {
    expect(splitWords("Crème brûlée")).toEqual(["Creme", "brulee"]);
    expect(splitWords("Crème brûlée", { transliterate: false })).toEqual(["Crème", "brûlée"]);
  });
});

describe("code cases", () => {
  const input = "Hello world from XMLHttpRequest";

  it.each<[TextCase, string]>([
    ["camel", "helloWorldFromXmlHttpRequest"],
    ["pascal", "HelloWorldFromXmlHttpRequest"],
    ["snake", "hello_world_from_xml_http_request"],
    ["kebab", "hello-world-from-xml-http-request"],
    ["constant", "HELLO_WORLD_FROM_XML_HTTP_REQUEST"],
    ["dot", "hello.world.from.xml.http.request"],
    ["path", "hello/world/from/xml/http/request"],
    ["train", "Hello-World-From-Xml-Http-Request"],
  ])("%s", (textCase, expected) => {
    expect(to(input, textCase)).toBe(expected);
  });

  it("converts between code cases", () => {
    expect(to("user_first_name", "camel")).toBe("userFirstName");
    expect(to("userFirstName", "constant")).toBe("USER_FIRST_NAME");
    expect(to("USER_FIRST_NAME", "kebab")).toBe("user-first-name");
  });

  it("converts each line on its own and keeps blank ones", () => {
    expect(to("first name\n\nlast name", "camel")).toBe("firstName\n\nlastName");
  });

  it("keeps uncased scripts", () => {
    expect(to("hello 世界", "snake")).toBe("hello_世界");
  });
});

describe("prose cases", () => {
  it("lower and UPPER keep everything else", () => {
    expect(to("Hello, World!", "lower")).toBe("hello, world!");
    expect(to("Hello, World!", "upper")).toBe("HELLO, WORLD!");
  });

  it("Title Case keeps small words lower, except first, last and after a colon", () => {
    expect(to("the lord of the rings", "title")).toBe("The Lord of the Rings");
    expect(to("what are you looking at", "title")).toBe("What Are You Looking At");
    expect(to("dune: the desert planet", "title")).toBe("Dune: The Desert Planet");
    expect(to("the lord of the rings", "title", { lowerSmallWords: false })).toBe("The Lord Of The Rings");
  });

  it("Title Case handles apostrophes and acronyms", () => {
    expect(to("don't stop believin' at NASA", "title")).toBe("Don't Stop Believin' at NASA");
    expect(to("HELLO WORLD OF CODE", "title")).toBe("Hello World of Code");
    expect(to("a guide to HTML", "title", { keepAcronyms: false })).toBe("A Guide to Html");
  });

  it("Sentence case capitalises each sentence and line", () => {
    expect(to("hELLO THERE. how are you? i'm fine!\nnew LINE", "sentence", { keepAcronyms: false })).toBe("Hello there. How are you? I'm fine!\nNew line");
    expect(to("we use HTML and CSS. it works", "sentence")).toBe("We use HTML and CSS. It works");
  });
});

describe("caseLabels", () => {
  it("writes each case's name in that case", () => {
    expect(to("camel case", "camel")).toBe(caseLabels.camel);
    expect(to("snake case", "snake")).toBe(caseLabels.snake);
    expect(to("constant case", "constant")).toBe(caseLabels.constant);
    expect(to("train case", "train")).toBe(caseLabels.train);
  });
});
