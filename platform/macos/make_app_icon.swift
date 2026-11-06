import AppKit

let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()

let logo = NSImage(contentsOfFile: CommandLine.arguments[1])!
logo.draw(in: NSRect(x: 72, y: 72, width: 880, height: 880),
          from: .zero, operation: .sourceOver, fraction: 1)

image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!
    .write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
