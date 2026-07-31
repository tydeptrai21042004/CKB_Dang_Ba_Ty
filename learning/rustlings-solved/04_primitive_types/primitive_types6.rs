fn main() {}

#[cfg(test)]
mod tests {
    #[test]
    fn indexing_tuple() {
        let numbers = (1, 2, 3);
        let second = numbers.1;
        assert_eq!(second, 2, "This is not the second number in the tuple!");
    }
}
