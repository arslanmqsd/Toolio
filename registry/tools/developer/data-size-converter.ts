import type { ToolConfig } from "@/registry/types";

const dataSizeConverter: ToolConfig = {
  id: "data-size-converter",
  category: "developer",
  title: "Data Size Converter",
  description: "Convert bytes, KB, MB, GB and TB to binary units like KiB, MiB and GiB, and to bits, exactly.",
  keywords: [
    "data size converter",
    "byte converter",
    "bytes to mb",
    "bytes to gb",
    "mb to gb",
    "gb to mb",
    "kb to mb",
    "gb to tb",
    "kib",
    "mib",
    "gib",
    "tib",
    "kb vs kib",
    "gb vs gib",
    "binary units",
    "bits to bytes",
    "megabits to megabytes",
    "mbps to mb/s",
    "file size converter",
    "storage converter",
    "why does my 1tb drive show 931gb",
  ],
  actions: ["convert", "calculate"],
  component: () => import("@/components/tools/developer/DataSizeConverter"),
  consumes: [],
  produces: [],
};

export default dataSizeConverter;
