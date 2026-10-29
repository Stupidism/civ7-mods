#import <Foundation/Foundation.h>
// Launcher flags precede Steam's executable. Everything after it belongs to the game.
static NSDictionary *C7LaunchPlan(NSArray<NSString *> *argv, BOOL nativeDefault, NSString **error) {
    BOOL native=nativeDefault, playAgain=NO;
    NSString *game=nil;
    NSMutableArray *arguments=[NSMutableArray array];
    for (NSUInteger i=1;i<argv.count;i++) {
        NSString *arg=argv[i];
        if (game) { [arguments addObject:arg]; continue; }
        if ([arg isEqual:@"--native-input"]) { native=YES; continue; }
        if ([arg isEqual:@"--play-again"]) { playAgain=YES; continue; }
        if ([arg isEqual:@"--"]) continue;
        if ([arg hasPrefix:@"-psn_"]) continue; // Older Finder launch services.
        if ([arg isAbsolutePath] && [arg.lastPathComponent isEqual:@"CivilizationVII.app"])
            arg=[arg stringByAppendingPathComponent:@"Contents/MacOS/CivilizationVII"];
        if ([arg isAbsolutePath] && [arg hasSuffix:@"/CivilizationVII.app/Contents/MacOS/CivilizationVII"]) { game=arg; continue; }
        if (error) *error=[@"无法识别启动参数 / Unknown launcher argument: " stringByAppendingString:arg];
        return nil;
    }
    NSMutableDictionary *plan=[@{@"native":@(native),@"playAgain":@(playAgain),@"arguments":arguments} mutableCopy];
    if (game) plan[@"game"]=game;
    return plan;
}
static BOOL C7VerifyResources(NSString *root, NSDictionary *manifest) {
    if (![manifest isKindOfClass:NSDictionary.class] || !manifest.count || !manifest[@"node"] || !manifest[@"supervisor.mjs"]) return NO;
    NSString *base=root.stringByResolvingSymlinksInPath;
    for (id key in manifest) {
        if (![key isKindOfClass:NSString.class] || [key isAbsolutePath] || [[key pathComponents] containsObject:@".."]) return NO;
        NSString *path=[[root stringByAppendingPathComponent:key] stringByResolvingSymlinksInPath];
        if (![path hasPrefix:[base stringByAppendingString:@"/"]] || ![manifest[key] isKindOfClass:NSString.class] || ![C7Hash(path) isEqual:manifest[key]]) return NO;
    }
    return YES;
}
