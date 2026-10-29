#import <Cocoa/Cocoa.h>
#include <sys/file.h>
#include <libproc.h>
#include <unistd.h>
#include <vector>
#include "launcher-core.h"
#include "launch-plan.h"

static NSString * const ExpectedGame = @"55642f4d349a617242e5610d3458341b7af254a9eecb4eb2955d0cbc097c5ac7";
static BOOL gameRunning() {
    int count = proc_listallpids(nullptr,0);
    if (count <= 0) return YES;
    std::vector<pid_t> pids((size_t)count + 128);
    count = proc_listallpids(pids.data(), (int)(pids.size()*sizeof(pid_t)));
    if (count <= 0 || (size_t)count >= pids.size()) return YES;
    for (int i=0;i<count;++i) {
        char name[PROC_PIDPATHINFO_MAXSIZE] = {};
        if (proc_pidpath(pids[i],name,sizeof(name)) > 0 &&
            [[NSString stringWithUTF8String:name].lastPathComponent isEqualToString:@"CivilizationVII"]) return YES;
    }
    return NO;
}

@interface Launcher : NSObject <NSApplicationDelegate>
@property NSDictionary *plan;
@property NSTask *helper;
@property BOOL helperFailed;
@property NSWindow *window;
@property NSTextField *status;
@property NSTask *game;
@property NSString *support;
@property NSString *runFolder;
@property NSString *recoveryPath;
@property NSTimer *timer;
@property NSDate *started;
@property BOOL ready;
@property int lockFD;
@end

@implementation Launcher
- (void)message:(NSString *)message {
    NSAlert *alert = [NSAlert new]; alert.messageText = @"更好的Mod支持 / Better Mod Support";
    alert.informativeText = message; [alert addButtonWithTitle:@"好 / OK"];
    [NSApp activateIgnoringOtherApps:YES]; [alert runModal];
}
- (void)fail:(NSString *)message { [self stopHelper]; [self restorePanel]; [self message:message]; [NSApp terminate:nil]; }
- (void)record:(NSString *)message {
    if (!_runFolder) return;
    NSString *path = [_runFolder stringByAppendingPathComponent:@"launcher.log"];
    NSFileHandle *file = [NSFileHandle fileHandleForWritingAtPath:path];
    if (!file) { [NSData.data writeToFile:path atomically:YES]; file=[NSFileHandle fileHandleForWritingAtPath:path]; }
    [file seekToEndOfFile]; [file writeData:[[NSString stringWithFormat:@"%@ %@\n",NSDate.date,message] dataUsingEncoding:NSUTF8StringEncoding]]; [file closeFile];
}
- (BOOL)restorePanel {
    if (!_recoveryPath) return YES;
    NSData *data = [NSData dataWithContentsOfFile:_recoveryPath];
    if (!data) return YES;
    NSDictionary *r = [NSJSONSerialization JSONObjectWithData:data options:0 error:nullptr];
    NSString *expected = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Civilization VII/AppOptions.txt"];
    if (!r || ![r[@"path"] isEqualToString:expected]) return NO;
    NSString *current = [NSString stringWithContentsOfFile:expected encoding:NSUTF8StringEncoding error:nullptr];
    NSString *restored = current ? C7RestorePanel(current,r) : nil;
    if (!restored || ![restored writeToFile:expected atomically:YES encoding:NSUTF8StringEncoding error:nullptr]) return NO;
    [NSFileManager.defaultManager removeItemAtPath:_recoveryPath error:nullptr];
    [self record:@"Restored only EnableDebugPanels; preserved other settings."];
    return YES;
}
- (BOOL)preparePanel {
    NSString *path = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Civilization VII/AppOptions.txt"];
    BOOL exists = [NSFileManager.defaultManager fileExistsAtPath:path];
    NSString *original = exists ? [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nullptr] : @"";
    NSDictionary *plan = original ? C7EnablePanel(original) : nil;
    if (!plan) return NO;
    if (![plan[@"changed"] boolValue]) return YES;
    NSString *backup = [_runFolder stringByAppendingPathComponent:@"AppOptions.before.txt"];
    if (![original writeToFile:backup atomically:YES encoding:NSUTF8StringEncoding error:nullptr]) return NO;
    NSMutableDictionary *record = [plan mutableCopy]; [record removeObjectForKey:@"text"];
    record[@"path"] = path; record[@"backup"] = backup;
    NSData *data = [NSJSONSerialization dataWithJSONObject:record options:NSJSONWritingPrettyPrinted error:nullptr];
    if (![data writeToFile:_recoveryPath atomically:YES]) return NO;
    if (![NSFileManager.defaultManager createDirectoryAtPath:path.stringByDeletingLastPathComponent withIntermediateDirectories:YES attributes:nil error:nullptr]) return NO;
    return [plan[@"text"] writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nullptr];
}
- (NSURL *)findGame {
    NSMutableOrderedSet *libraries = [NSMutableOrderedSet orderedSet];
    NSString *steam = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Steam"];
    [libraries addObject:steam];
    for (NSString *vdf in @[@"steamapps/libraryfolders.vdf",@"config/libraryfolders.vdf"]) {
        NSString *text = [NSString stringWithContentsOfFile:[steam stringByAppendingPathComponent:vdf] encoding:NSUTF8StringEncoding error:nullptr];
        if (text) [libraries addObjectsFromArray:C7VDFValues(text,@"path")];
    }
    for (NSString *library in libraries) {
        NSString *manifest = [NSString stringWithContentsOfFile:[library stringByAppendingPathComponent:@"steamapps/appmanifest_1295660.acf"] encoding:NSUTF8StringEncoding error:nullptr];
        NSArray *dirs = manifest ? C7VDFValues(manifest,@"installdir") : @[];
        if (dirs.count != 1 || [dirs[0] containsString:@"/"] || [dirs[0] isEqual:@".."]) continue;
        NSString *path = [library stringByAppendingPathComponent:[NSString stringWithFormat:@"steamapps/common/%@/CivilizationVII.app",dirs[0]]];
        if ([NSFileManager.defaultManager fileExistsAtPath:[path stringByAppendingPathComponent:@"Contents/MacOS/CivilizationVII"]]) return [NSURL fileURLWithPath:path];
    }
    NSString *saved = [NSUserDefaults.standardUserDefaults stringForKey:@"GameAppPath"];
    if (saved && [NSFileManager.defaultManager fileExistsAtPath:[saved stringByAppendingPathComponent:@"Contents/MacOS/CivilizationVII"]]) return [NSURL fileURLWithPath:saved];
    NSOpenPanel *picker = NSOpenPanel.openPanel;
    picker.message = @"请选择 Steam 安装的 CivilizationVII.app / Select your Steam CivilizationVII.app";
    picker.allowedFileTypes = @[@"app"]; picker.canChooseDirectories = NO;
    if ([picker runModal] != NSModalResponseOK) return nil;
    [NSUserDefaults.standardUserDefaults setObject:picker.URL.path forKey:@"GameAppPath"];
    return picker.URL;
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    NSString *problem=nil;
    _plan=C7LaunchPlan(NSProcessInfo.processInfo.arguments, [NSBundle.mainBundle.infoDictionary[@"DefaultNativeInput"] boolValue], &problem);
    if (!_plan) { [self fail:problem]; return; }
    _window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0,0,480,110) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
    _window.title = @"更好的Mod支持 · 启动文明7 / Better Mod Support";
    _status = [NSTextField labelWithString:@"正在寻找游戏并检查版本… / Checking your game…"];
    _status.frame=NSMakeRect(20,25,440,60); [_window.contentView addSubview:_status]; [_window center]; [_window makeKeyAndOrderFront:nil];
    _support = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Application Support/Civ7 Native Debug Input"];
    if (![NSFileManager.defaultManager createDirectoryAtPath:_support withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nullptr]) { [self fail:@"无法创建启动记录目录 / Cannot create launcher data folder."]; return; }
    _lockFD = open([[_support stringByAppendingPathComponent:@"launcher.lock"] fileSystemRepresentation],O_CREAT|O_RDWR|O_CLOEXEC,0600);
    if (_lockFD < 0 || flock(_lockFD,LOCK_EX|LOCK_NB)) { [self fail:@"启动器已在运行，请不要重复打开。\nThe launcher is already running."]; return; }
    if (gameRunning()) { [self fail:@"请先正常退出文明7，再双击这个启动器。\nQuit Civilization VII before opening this launcher."]; return; }
    _recoveryPath=[_support stringByAppendingPathComponent:@"pending-settings.json"];
    if (![self restorePanel]) { [self fail:@"上次设置需要核对，已停止启动。备份保留在启动记录目录。\nPrevious settings need review; launch stopped. Backups are retained in the launcher data folder."]; return; }
    _runFolder=[_support stringByAppendingPathComponent:[@"Runs/" stringByAppendingString:NSUUID.UUID.UUIDString]];
    [NSFileManager.defaultManager createDirectoryAtPath:_runFolder withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:nullptr];
    NSURL *app = _plan[@"game"] ? [NSURL fileURLWithPath:((NSString *)_plan[@"game"]).stringByDeletingLastPathComponent.stringByDeletingLastPathComponent.stringByDeletingLastPathComponent] : [self findGame]; if (!app) { [NSApp terminate:nil]; return; }
    NSString *exe = [app.path stringByAppendingPathComponent:@"Contents/MacOS/CivilizationVII"];
    NSString *bridge = [NSBundle.mainBundle.bundlePath stringByAppendingPathComponent:@"Contents/Frameworks/libCiv7NativeInput.dylib"];
    if ([_plan[@"native"] boolValue] && ![C7Hash(exe) isEqualToString:ExpectedGame]) { [self fail:@"这个版本暂不兼容：需要 Steam Apple Silicon 版 1.5.0 (1311346)。没有启动游戏或更改设置。\nUnsupported game build. Requires Steam Apple Silicon 1.5.0 (1311346). No game or settings changes."]; return; }
    if ([_plan[@"native"] boolValue] && ![C7Hash(bridge) isEqualToString:[NSBundle.mainBundle objectForInfoDictionaryKey:@"BridgeSHA256"]]) { [self fail:@"启动器文件不完整，请重新解压。\nLauncher files are incomplete. Extract the package again."]; return; }
    if ([NSRunningApplication runningApplicationsWithBundleIdentifier:@"com.valvesoftware.steam"].count == 0) {
        NSURL *steam = [NSWorkspace.sharedWorkspace URLForApplicationWithBundleIdentifier:@"com.valvesoftware.steam"];
        if (!steam) { [self fail:@"请先安装并登录 Steam。\nInstall Steam and sign in first."]; return; }
        _status.stringValue=@"正在打开 Steam… / Opening Steam…";
        NSWorkspaceOpenConfiguration *config=[NSWorkspaceOpenConfiguration configuration]; config.activates=NO;
        [NSWorkspace.sharedWorkspace openApplicationAtURL:steam configuration:config completionHandler:^(NSRunningApplication *application,NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (!application || error) { [self fail:@"无法打开 Steam，请登录后重试。\nCould not open Steam. Sign in and retry."]; return; }
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW,5*NSEC_PER_SEC), dispatch_get_main_queue(), ^{ [self launch:exe bridge:bridge]; });
            });
        }];
    } else [self launch:exe bridge:bridge];
}
- (BOOL)startHelper {
    if (![_plan[@"playAgain"] boolValue]) return YES;
    NSString *resources=NSBundle.mainBundle.resourcePath;
    NSDictionary *manifest=[NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:[resources stringByAppendingPathComponent:@"helper-manifest.json"]] ?: NSData.data options:0 error:nullptr];
    if (!C7VerifyResources(resources,manifest)) { [self fail:@"辅助组件不完整，请重新解压。 / Helper files are incomplete; extract the package again."]; return NO; }
    _helper=[NSTask new];
    _helper.executableURL=[NSURL fileURLWithPath:[resources stringByAppendingPathComponent:@"node"]];
    _helper.arguments=@[[resources stringByAppendingPathComponent:@"supervisor.mjs"],_runFolder,[NSString stringWithFormat:@"%d",getpid()]];
    NSMutableDictionary *environment=[NSProcessInfo.processInfo.environment mutableCopy];
    for (NSString *key in @[@"NODE_OPTIONS",@"NODE_PATH",@"DYLD_INSERT_LIBRARIES"]) [environment removeObjectForKey:key];
    _helper.environment=environment;
    NSString *output=[_runFolder stringByAppendingPathComponent:@"helpers.log"]; [NSData.data writeToFile:output atomically:YES];
    _helper.standardOutput=[NSFileHandle fileHandleForWritingAtPath:output]; _helper.standardError=_helper.standardOutput;
    NSError *error=nil;
    if (![_helper launchAndReturnError:&error]) { [self fail:error.localizedDescription]; return NO; }
    NSString *ready=[_runFolder stringByAppendingPathComponent:@"helpers-ready.json"];
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:15];
    while (_helper.running && deadline.timeIntervalSinceNow>0) {
        if ([NSFileManager.defaultManager fileExistsAtPath:ready]) return YES;
        [NSThread sleepForTimeInterval:0.05];
    }
    [self fail:@"存档辅助组件未能启动，游戏尚未启动。请查看 helpers.log。 / The save helper did not become ready. The game was not started. Check helpers.log."];
    return NO;
}
- (void)stopHelper {
    if (!_helper.running) return;
    [_helper terminate];
    NSDate *deadline=[NSDate dateWithTimeIntervalSinceNow:5];
    while (_helper.running && deadline.timeIntervalSinceNow>0) [NSThread sleepForTimeInterval:0.05];
    if (_helper.running) kill(_helper.processIdentifier,SIGKILL);
    [_helper waitUntilExit];
}
- (void)launch:(NSString *)exe bridge:(NSString *)bridge {
    if (gameRunning()) { [self fail:@"游戏已在运行，请退出后重试。\nThe game is already running. Quit it and retry."]; return; }
    if ([_plan[@"native"] boolValue] && ![self preparePanel]) { [self fail:@"无法准备原版调试面板设置，已停止。\nCould not prepare DebugPanel settings. Launch stopped."]; return; }
    if (![self startHelper]) return;
    _game=[NSTask new]; _game.executableURL=[NSURL fileURLWithPath:exe]; _game.currentDirectoryURL=[NSURL fileURLWithPath:exe.stringByDeletingLastPathComponent];
    NSMutableDictionary *env=[NSProcessInfo.processInfo.environment mutableCopy];
    if ([_plan[@"native"] boolValue]) {
    NSString *existing=env[@"DYLD_INSERT_LIBRARIES"];
    env[@"DYLD_INSERT_LIBRARIES"]=existing.length ? [existing stringByAppendingFormat:@":%@",bridge] : bridge;
    } env[@"SteamAppId"]=@"1295660"; env[@"SteamGameId"]=@"1295660";
    if ([_plan[@"native"] boolValue]) {
    env[@"CIV7_NATIVE_INPUT_ENABLE"]=@"1"; env[@"CIV7_NATIVE_INPUT_LOG"]=[_runFolder stringByAppendingPathComponent:@"native-input.log"];
    }
    _game.arguments=_plan[@"arguments"];
    _game.environment=env;
    NSString *output=[_runFolder stringByAppendingPathComponent:@"game.log"]; [NSData.data writeToFile:output atomically:YES];
    _game.standardOutput=[NSFileHandle fileHandleForWritingAtPath:output]; _game.standardError=_game.standardOutput;
    __weak Launcher *weakSelf=self;
    _game.terminationHandler=^(NSTask *task) { dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf gameFinished:task]; }); };
    NSError *error=nil;
    if (![_game launchAndReturnError:&error]) { [self restorePanel]; [self fail:[NSString stringWithFormat:@"启动失败 / Launch failed: %@",error.localizedDescription]]; return; }
    [self record:[NSString stringWithFormat:@"Game PID %d; launcher %@",_game.processIdentifier,NSBundle.mainBundle.bundlePath]];
    _started=NSDate.date; _status.stringValue=@"游戏正在启动… / Starting the game…";
    _timer=[NSTimer scheduledTimerWithTimeInterval:0.5 target:self selector:@selector(checkReady:) userInfo:nil repeats:YES];
}
- (void)checkReady:(NSTimer *)timer {
    if (_helper && !_helper.running && !_helperFailed) {
        _helperFailed=YES;
        [self message:@"辅助组件已停止，游戏仍可继续。下次启动前请检查启动记录。 / A helper stopped. You may continue the game; check the logs before relaunching."];
    }
    if (_ready) return;
    if (![_plan[@"native"] boolValue]) { _ready=YES; [_window orderOut:nil]; [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory]; return; }
    NSString *text=[NSString stringWithContentsOfFile:[_runFolder stringByAppendingPathComponent:@"native-input.log"] encoding:NSUTF8StringEncoding error:nullptr];
    if ([text containsString:@"installed: one ConsoleInput call redirected"]) {
        _ready=YES; [_window orderOut:nil]; [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
        [self record:@"Native input ready. Press the backtick key in game to open DebugPanel."];
    } else if ([text containsString:@"refused:"] || -_started.timeIntervalSinceNow > 30) {
        [timer invalidate]; [self message:@"游戏已启动，但输入修复未确认加载。请正常退出游戏后查看启动记录。\nThe game started, but the input fix was not confirmed. Quit normally and check the launcher logs."];
    }
}
- (void)gameFinished:(NSTask *)task {
    [_timer invalidate]; [self stopHelper]; [self record:[NSString stringWithFormat:@"Game ended: %d",task.terminationStatus]];
    if (gameRunning()) { [self message:@"游戏启动了另一个进程，设置暂未恢复。请正常退出游戏，再打开启动器恢复设置。\nAnother game process is running. Quit it, then reopen the launcher to restore settings."]; }
    else if (![self restorePanel]) [self message:@"调试面板设置已有其他变化，未覆盖。原始备份保留在启动记录目录。\nDebugPanel settings changed elsewhere and were not overwritten. Original backups are retained."];
    if (!_ready && task.terminationStatus != 0) [self message:@"游戏未正常启动。请确认 Steam 已登录，并查看启动记录。\nThe game did not start normally. Check Steam sign-in and the launcher logs."];
    [NSApp terminate:nil];
}
- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender {
    (void)sender;
    if (_game.running) { [self message:@"请先退出文明7，启动器会自动结束并恢复设置。\nQuit Civilization VII first. The launcher will restore settings and exit automatically."]; return NSTerminateCancel; }
    return NSTerminateNow;
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { (void)sender; return NO; }
@end
int main(int argc,const char **argv) {
    (void)argc; (void)argv;
    @autoreleasepool { NSApplication *app=NSApplication.sharedApplication; [app setActivationPolicy:NSApplicationActivationPolicyRegular]; Launcher *delegate=[Launcher new]; app.delegate=delegate; [app run]; }
    return 0;
}
