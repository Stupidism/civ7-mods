import AppKit
import Vision

// Read the clipboard only for an explicit import. No clipboard polling,
// network service, temporary screenshot, or persistent image history.
do {
    let image: NSImage
    if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--file" {
        guard let loaded = NSImage(contentsOfFile: CommandLine.arguments[2]) else {
            throw NSError(domain: "无法读取测试图片", code: 1)
        }
        image = loaded
    } else if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--clipboard" {
        let clipboard = NSPasteboard.general
        if let images = clipboard.readObjects(forClasses: [NSImage.self]) as? [NSImage], let pasted = images.first {
            image = pasted
        } else if let text = clipboard.string(forType: .string), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            guard text.count <= 32000 else { throw NSError(domain: "文字过长，请只复制需要的一组种子。", code: 1) }
            let lines: [[String: Any]] = text.components(separatedBy: .newlines).map { ["text": $0, "confidence": 1] }
            let data = try JSONSerialization.data(withJSONObject: ["kind": "text", "lines": lines])
            FileHandle.standardOutput.write(data)
            exit(0)
        } else {
            throw NSError(domain: "剪贴板里没有图片或文字。请先复制截图或一组种子文字。", code: 1)
        }
    } else {
        throw NSError(domain: "请选择图片来源", code: 1)
    }
    guard let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
          cgImage.width <= 16000, cgImage.height <= 16000,
          cgImage.width * cgImage.height <= 60000000 else {
        throw NSError(domain: "图片无法读取或过大，请使用单张游戏截图。", code: 1)
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "zh-Hant", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: cgImage).perform([request])
    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let box = observation.boundingBox
        return ["text": candidate.string, "confidence": candidate.confidence,
                "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
    }
    let data = try JSONSerialization.data(withJSONObject: ["lines": lines, "width": cgImage.width, "height": cgImage.height])
    FileHandle.standardOutput.write(data)
} catch {
    FileHandle.standardError.write(Data((error as NSError).domain.utf8))
    exit(1)
}
