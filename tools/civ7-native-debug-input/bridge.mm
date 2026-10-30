#import <Cocoa/Cocoa.h>
#include <CommonCrypto/CommonDigest.h>
#include <mach-o/dyld.h>
#include <atomic>
#include <chrono>
#include <mutex>
#include <string>
#include "patch.hpp"

using Input = bool (*)(const char *, char *, size_t, int, void *, void *);
static Input originalInput;
static char *nativeBuffer;
static std::mutex queueMutex;
static std::string pending;
static double pendingAt;
static std::atomic<double> lastDraw{0};
static std::atomic<bool> uiScheduled{false};
static std::atomic<unsigned> submitted{0};
static double now() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count(); }
static void logLine(NSString *message) {
    const char *path = getenv("CIV7_NATIVE_INPUT_LOG");
    if (!path) return;
    FILE *f = fopen(path, "a");
    if (f) { fprintf(f, "%s %s\n", NSDate.date.description.UTF8String, message.UTF8String); fclose(f); }
}

@interface CivNativeInput : NSObject <NSWindowDelegate>
@property NSPanel *panel;
@property NSTextField *field;
@property NSTextField *status;
@property NSButton *button;
@property NSTimer *timer;
@property id closeObserver;
@property unsigned shownCount;
@property BOOL wasActive;
@end
static CivNativeInput *controller;

@implementation CivNativeInput
- (instancetype)init {
    if (!(self = [super init])) return nil;
    _panel = [[NSPanel alloc] initWithContentRect:NSMakeRect(0, 0, 560, 116)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable
        backing:NSBackingStoreBuffered defer:NO];
    _panel.title = @"原版 DebugPanel · Mac 输入 / Native input";
    _panel.releasedWhenClosed = NO;
    _panel.level = NSFloatingWindowLevel;
    _panel.delegate = self;
    _panel.hidesOnDeactivate = YES;
    _field = [[NSTextField alloc] initWithFrame:NSMakeRect(16, 58, 420, 30)];
    _field.placeholderString = @"输入原版命令，例如 reveal all";
    _field.font = [NSFont monospacedSystemFontOfSize:14 weight:NSFontWeightRegular];
    _field.target = self; _field.action = @selector(submit:);
    _button = [NSButton buttonWithTitle:@"执行 / Run" target:self action:@selector(submit:)];
    _button.frame = NSMakeRect(444, 58, 100, 30);
    _status = [NSTextField labelWithString:@"命令、历史和输出由原版 DebugPanel 处理"];
    _status.frame = NSMakeRect(16, 12, 528, 34); _status.font = [NSFont systemFontOfSize:12];
    [_panel.contentView addSubview:_field]; [_panel.contentView addSubview:_button]; [_panel.contentView addSubview:_status];
    [_panel center]; [_panel makeKeyAndOrderFront:nil]; [_panel makeFirstResponder:_field];
    _timer = [NSTimer scheduledTimerWithTimeInterval:0.25 target:self selector:@selector(tick:) userInfo:nil repeats:YES];
    __weak CivNativeInput *weakSelf = self;
    _closeObserver = [NSNotificationCenter.defaultCenter addObserverForName:NSWindowWillCloseNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
        NSWindow *closing = note.object;
        if (![closing.title hasPrefix:@"Civilization VII"] || [closing isKindOfClass:NSPanel.class]) return;
        CivNativeInput *owner = weakSelf;
        [owner.timer invalidate]; [owner.panel close];
        logLine(@"game window closing; auxiliary input closed");
    }];
    logLine(@"Mac text field opened; native ConsoleInput reached");
    return self;
}
- (void)tick:(NSTimer *)timer {
    bool active = now() - lastDraw.load() < 1.0;
    _button.enabled = active;
    std::lock_guard<std::mutex> guard(queueMutex);
    if (!pending.empty() && now() - pendingAt > 2.0) {
        pending.clear(); _status.stringValue = @"未提交：原版输入框未响应，请重新打开控制台";
        logLine(@"expired without native submit");
    } else if (!active && _wasActive) {
        _status.stringValue = @"请先打开原版 DebugPanel 的 Output 输入区";
    } else if (active && submitted.load() != _shownCount) {
        _shownCount = submitted.load();
        _status.stringValue = [NSString stringWithFormat:@"已交给原版处理 %u 次；执行结果请看原版输出", submitted.load()];
    }
    _wasActive = active;
}
- (void)submit:(id)sender {
    NSString *text = [_field.stringValue stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    NSData *bytes = [text dataUsingEncoding:NSASCIIStringEncoding allowLossyConversion:NO];
    if (!bytes || bytes.length == 0 || bytes.length > 254) {
        _status.stringValue = @"请输入 1–254 个英文命令字符 / ASCII only"; return;
    }
    const unsigned char *p = (const unsigned char *)bytes.bytes;
    for (NSUInteger i = 0; i < bytes.length; ++i) if (p[i] < 32 || p[i] > 126) {
        _status.stringValue = @"只接受单行命令 / Single line only"; return;
    }
    if (now() - lastDraw.load() >= 1.0) { _status.stringValue = @"未提交：请先打开原版控制台"; return; }
    std::lock_guard<std::mutex> guard(queueMutex);
    if (!pending.empty()) { _status.stringValue = @"上一条仍在等待原版输入框"; return; }
    pending.assign((const char *)bytes.bytes, bytes.length); pendingAt = now();
    _status.stringValue = @"等待原版输入框接收…";
    _field.stringValue = @"";
}
- (BOOL)windowShouldClose:(NSWindow *)sender {
    { std::lock_guard<std::mutex> guard(queueMutex); pending.clear(); }
    return YES;
}
@end

// Shared-launcher mode has no Cocoa input window. A private, per-run file
// mailbox is fed by the registered in-game UI through the framework host.
static NSString *enhancedFolder;
static double lastStatusWrite=0, lastRequestRead=0;
static void writeMailbox(NSString *name, NSDictionary *value) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nullptr];
    [data writeToFile:[enhancedFolder stringByAppendingPathComponent:name] atomically:YES];
}
static std::string enhancedCommand(double t) {
    if (t-lastStatusWrite>0.25) { lastStatusWrite=t; writeMailbox(@"native-status.json",@{@"time":@(NSDate.date.timeIntervalSince1970)}); }
    if (t-lastRequestRead<0.05) return {}; lastRequestRead=t;
    NSString *file=[enhancedFolder stringByAppendingPathComponent:@"native-request.json"];
    NSData *data=[NSData dataWithContentsOfFile:file];
    if (!data) return {};
    [NSFileManager.defaultManager removeItemAtPath:file error:nullptr];
    if (data.length>2048) return {};
    NSDictionary *r=[NSJSONSerialization JSONObjectWithData:data options:0 error:nullptr];
    if (![r isKindOfClass:NSDictionary.class] || ![r[@"id"] isKindOfClass:NSString.class] ||
        ![[NSUUID alloc] initWithUUIDString:r[@"id"]]) return {};
    NSString *command=r[@"command"]; NSNumber *timestamp=r[@"time"];
    if (![command isKindOfClass:NSString.class] || ![timestamp isKindOfClass:NSNumber.class]) return {};
    double age=NSDate.date.timeIntervalSince1970-timestamp.doubleValue;
    NSData *bytes=[command dataUsingEncoding:NSASCIIStringEncoding allowLossyConversion:NO];
    BOOL valid=bytes && bytes.length>=1 && bytes.length<=254 && age>=0 && age<2.0;
    for (NSUInteger i=0;valid && i<bytes.length;i++) { unsigned char c=((const unsigned char *)bytes.bytes)[i]; if(c<32||c>126)valid=NO; }
    if (!valid) { writeMailbox(@"native-result.json",@{@"id":r[@"id"],@"error":@"invalid-or-expired-command"}); return {}; }
    writeMailbox(@"native-result.json",@{@"id":r[@"id"],@"submitted":@YES});
    return std::string((const char *)bytes.bytes,bytes.length);
}

static bool replacementInput(const char *label, char *buffer, size_t size, int flags, void *callback, void *user) {
    bool result = originalInput(label, buffer, size, flags, callback, user);
    if (buffer != nativeBuffer || size != 512 || strcmp(label, "##Input")) return result;
    double t = now(); double previous = lastDraw.exchange(t);
    if (!enhancedFolder && !uiScheduled.exchange(true)) dispatch_async(dispatch_get_main_queue(), ^{ controller = [[CivNativeInput alloc] init]; });
    else if (!enhancedFolder && t - previous > 2.0) dispatch_async(dispatch_get_main_queue(), ^{
        [controller.panel makeKeyAndOrderFront:nil]; [controller.panel makeFirstResponder:controller.field];
    });
    std::string command=enhancedFolder ? enhancedCommand(t) : std::string();
    { std::lock_guard<std::mutex> guard(queueMutex);
      if (!pending.empty() && t - pendingAt <= 2.0) command.swap(pending);
    }
    if (command.empty()) return result;
    memcpy(buffer, command.c_str(), command.size() + 1);
    submitted.fetch_add(1);
    logLine([NSString stringWithFormat:@"native InputText submit: %s", command.c_str()]);
    // The original caller now appends native history/output and emits its own
    // DebugConsoleInput event on its own thread. No per-command implementation.
    return true;
}

__attribute__((constructor)) static void install() {
    @autoreleasepool {
        if (!getenv("CIV7_NATIVE_INPUT_ENABLE") || strcmp(getenv("CIV7_NATIVE_INPUT_ENABLE"), "1")) return;
        uint32_t index = 0;
        while (index < _dyld_image_count() && _dyld_get_image_header(index)->filetype != MH_EXECUTE) ++index;
        if (index == _dyld_image_count()) { logLine(@"refused: main executable not found"); return; }
        const char *path = _dyld_get_image_name(index);
        NSData *data = [NSData dataWithContentsOfFile:[NSString stringWithUTF8String:path]];
        if (!data || data.length != 53683024) { logLine([NSString stringWithFormat:@"refused: binary size mismatch: %s (%lu)", path, (unsigned long)data.length]); return; }
        unsigned char digest[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
        NSMutableString *hex = [NSMutableString string];
        for (unsigned char byte : digest) [hex appendFormat:@"%02x", byte];
        if (![hex isEqualToString:@"55642f4d349a617242e5610d3458341b7af254a9eecb4eb2955d0cbc097c5ac7"]) {
            logLine(@"refused: binary hash mismatch"); return;
        }
        const char *folder=getenv("CIV7_ENHANCED_NATIVE_DIR");
        if (folder) {
            NSString *candidate=[NSString stringWithUTF8String:folder]; BOOL directory=NO;
            if (!candidate.isAbsolutePath || ![NSFileManager.defaultManager fileExistsAtPath:candidate isDirectory:&directory] || !directory) { logLine(@"refused: invalid enhanced session"); return; }
            enhancedFolder=candidate;
        }
        intptr_t slide = _dyld_get_image_vmaddr_slide(index);
        originalInput = reinterpret_cast<Input>(0x10198f090 + slide);
        nativeBuffer = reinterpret_cast<char *>(0x102fdb530 + slide);
        uintptr_t site = 0x10005918c + slide;
        constexpr uint32_t expected = 0x94000000 | ((0x10198f090ULL - 0x10005918cULL) >> 2);
        bool ok = redirectCall(site, expected, reinterpret_cast<void *>(&replacementInput));
        logLine(ok ? @"installed: one ConsoleInput call redirected; original parser/history/output retained" : @"refused: callsite patch unavailable");
    }
}
