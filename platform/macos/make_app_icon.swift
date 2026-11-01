import AppKit

let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)
image.lockFocus()

let tile = NSBezierPath(roundedRect: NSRect(x: 40, y: 40, width: 944, height: 944),
                        xRadius: 222, yRadius: 222)
NSGradient(starting: NSColor(calibratedRed: 0.08, green: 0.14, blue: 0.29, alpha: 1),
           ending: NSColor(calibratedRed: 0.20, green: 0.24, blue: 0.54, alpha: 1))!
    .draw(in: tile, angle: -55)

let logo = NSImage(contentsOfFile: CommandLine.arguments[1])!
logo.draw(in: NSRect(x: 162, y: 162, width: 700, height: 700),
          from: .zero, operation: .sourceOver, fraction: 1)

image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!
    .write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
