#include "../src/launcher-core.h"
#include "../src/launch-plan.h"
#include <cassert>
int main() { @autoreleasepool {
    NSString *game=@"/Volumes/My Games/文明7/CivilizationVII.app/Contents/MacOS/CivilizationVII", *error=nil;
    NSDictionary *p=C7LaunchPlan(@[@"launcher",@"--play-again",@"--native-input",game,@"--other",@"value with spaces",@"--play-again"],NO,&error);
    assert([p[@"game"] isEqual:game] && [p[@"native"] boolValue] && [p[@"playAgain"] boolValue]);
    assert(([p[@"arguments"] isEqual:@[@"--other",@"value with spaces",@"--play-again"]]));
    assert(![C7LaunchPlan(@[@"launcher"],NO,&error)[@"native"] boolValue]);
    assert([C7LaunchPlan(@[@"launcher"],YES,&error)[@"native"] boolValue]);
    assert([C7LaunchPlan(@[@"launcher",@"/Games/CivilizationVII.app"],NO,&error)[@"game"] hasSuffix:@"/MacOS/CivilizationVII"]);
    for (NSString *bad in @[@"%command%",@"/bin/sh",@"--unknown",@"relative/CivilizationVII"]) assert(!C7LaunchPlan(@[@"launcher",bad],NO,&error));
    assert(!C7VerifyResources(@"/tmp",nil));
    assert(!C7VerifyResources(@"/tmp",@{@"node":@"a",@"supervisor.mjs":@"b",@"../escape":@"c"}));
    puts("PASS launch flags, Steam argv, Finder fallback, resource/path rejection");
} }
