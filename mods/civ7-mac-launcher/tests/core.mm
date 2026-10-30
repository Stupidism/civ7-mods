#include "../src/launcher-core.h"
#include <cassert>
#include <cstdio>
int main() {
    @autoreleasepool {
        NSString *original=@"[Debug]\r\n; comment\r\n EnableDebugPanels 0 ; user setting\r\nOther 9\r\n";
        NSDictionary *plan=C7EnablePanel(original);
        assert([plan[@"changed"] boolValue]);
        assert([plan[@"text"] containsString:@"EnableDebugPanels 1\r\nOther 9"]);
        assert([C7RestorePanel(plan[@"text"],plan) isEqualToString:original]);
        NSString *changed=[plan[@"text"] stringByReplacingOccurrencesOfString:@"Other 9" withString:@"Other 12"];
        assert([C7RestorePanel(changed,plan) containsString:@"Other 12"]);
        assert(!C7RestorePanel([changed stringByReplacingOccurrencesOfString:@"EnableDebugPanels 1" withString:@"EnableDebugPanels 2"],plan));
        assert(!C7EnablePanel(@"EnableDebugPanels 0\nEnableDebugPanels 1\n"));
        assert(![C7EnablePanel(@"[Debug]\nEnableDebugPanels 1\n")[@"changed"] boolValue]);
        for (NSString *input in @[@"[Debug]\r\nOther 9\r\n",@"[Debug]",@"[Graphics]\nQuality 2\n",@""]) {
            NSDictionary *p=C7EnablePanel(input);
            assert([p[@"changed"] boolValue] && C7PanelLines(p[@"text"]).count==1);
            NSString *restored=C7RestorePanel(p[@"text"],p);
            assert(restored && C7PanelLines(restored).count==0);
            if ([input containsString:@"Other 9"]) assert([restored containsString:@"Other 9"]);
        }
        NSArray *paths=C7VDFValues(@"\"path\" \"/Volumes/My Games/Steam\" \"path\" \"/Volumes/中文/Steam\" \"label\" \"Ignore\"", @"path");
        assert(paths.count==2 && [paths[0] isEqual:@"/Volumes/My Games/Steam"] && [paths[1] containsString:@"中文"]);
        assert(C7VDFValues(@"\"installdir\" \"Sid Meier's Civilization VII\"", @"installdir").count==1);
        assert(C7VDFValues(@"broken", @"path").count==0);
        assert(!C7Hash(@"/this/path/does/not/exist"));
        puts("PASS: settings preservation/conflict refusal, missing keys, CRLF, Steam paths and hash failure.");
    }
}
