#import <Foundation/Foundation.h>
#import <CommonCrypto/CommonDigest.h>

static NSString *C7Hash(NSString *path) {
    NSData *data = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:nullptr];
    if (!data || data.length > UINT32_MAX) return nil;
    unsigned char hash[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(data.bytes, (CC_LONG)data.length, hash);
    NSMutableString *result = [NSMutableString string];
    for (unsigned char byte : hash) [result appendFormat:@"%02x", byte];
    return result;
}
static NSArray<NSTextCheckingResult *> *C7Matches(NSString *text, NSString *pattern) {
    return [[NSRegularExpression regularExpressionWithPattern:pattern options:0 error:nullptr]
            matchesInString:text options:0 range:NSMakeRange(0, text.length)];
}
static NSArray<NSString *> *C7VDFValues(NSString *text, NSString *key) {
    NSString *pattern = [NSString stringWithFormat:@"\"%@\"\\s+\"((?:\\\\.|[^\"\\\\])*)\"", [NSRegularExpression escapedPatternForString:key]];
    NSMutableArray *result = [NSMutableArray array];
    for (NSTextCheckingResult *match in C7Matches(text, pattern)) {
        NSString *value = [text substringWithRange:[match rangeAtIndex:1]];
        value = [[value stringByReplacingOccurrencesOfString:@"\\\"" withString:@"\""] stringByReplacingOccurrencesOfString:@"\\\\" withString:@"\\"];
        [result addObject:value];
    }
    return result;
}
static NSArray *C7PanelLines(NSString *text) {
    return C7Matches(text, @"(?m)^[ \\t]*EnableDebugPanels[ \\t]+[^\\r\\n]*");
}
// Keep the exact original line for compare-and-restore, including CRLF around it.
static NSDictionary *C7EnablePanel(NSString *text) {
    NSArray *lines = C7PanelLines(text);
    if (lines.count > 1) return nil;
    NSString *line = @"EnableDebugPanels 1";
    if (lines.count) {
        NSRange range = [lines.firstObject range];
        NSString *old = [text substringWithRange:range];
        if (C7Matches(old, @"^\\s*EnableDebugPanels\\s+1\\s*(?:;.*)?$").count)
            return @{@"text":text, @"changed":@NO};
        return @{@"text":[text stringByReplacingCharactersInRange:range withString:line], @"changed":@YES, @"before":old, @"after":line};
    }
    NSString *newline = [text containsString:@"\r\n"] ? @"\r\n" : @"\n";
    NSArray *sections = C7Matches(text, @"(?m)^\\[Debug\\][ \\t]*\\r?$");
    NSString *updated;
    if (sections.count) {
        NSUInteger end = NSMaxRange([sections.firstObject range]);
        if (end < text.length && [text characterAtIndex:end] == '\n') ++end;
        NSString *prefix = (end && [text characterAtIndex:end - 1] == '\n') ? @"" : newline;
        updated = [text stringByReplacingCharactersInRange:NSMakeRange(end,0) withString:[NSString stringWithFormat:@"%@%@%@",prefix,line,newline]];
    } else {
        updated = [text stringByAppendingFormat:@"%@%@", text.length && ![text hasSuffix:@"\n"] ? newline : @"", [NSString stringWithFormat:@"[Debug]%@%@%@",newline,line,newline]];
    }
    return @{@"text":updated, @"changed":@YES, @"before":NSNull.null, @"after":line};
}
static NSString *C7RestorePanel(NSString *current, NSDictionary *record) {
    NSArray *lines = C7PanelLines(current);
    if (lines.count != 1) return nil;
    NSRange range = [lines.firstObject range];
    if (![[current substringWithRange:range] isEqual:record[@"after"]]) return nil;
    if (record[@"before"] != NSNull.null)
        return [current stringByReplacingCharactersInRange:range withString:record[@"before"]];
    if (NSMaxRange(range) < current.length && [current characterAtIndex:NSMaxRange(range)] == '\r') ++range.length;
    if (NSMaxRange(range) < current.length && [current characterAtIndex:NSMaxRange(range)] == '\n') ++range.length;
    return [current stringByReplacingCharactersInRange:range withString:@""];
}
